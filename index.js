'use strict'

module.exports = builder

const module_id = require('module-id')

// ## Usage
// ```js
// builder(options)
// .on('warn', function () {
// })
// .parse(filename, callback)
// ```
function builder(entry, options, callback) {
  make_sure(options, 'pkg')
  make_sure(options, 'cwd')

  if (Object(options.babel) !== options.babel && options.babel !== false) {
    options.babel = {}
  }

  options.babel = mix({
    presets: ['stage-2']
  }, options.babel, false)

  return new Builder(options).parse(entry, callback)
}


function make_sure (options, key) {
  if (key in options) {
    return
  }

  throw new Error('`options.' + key + '` must be defined')
}


builder.Builder = Builder

var fs = require('fs')
var node_path = require('path')
var util = require('util')
var async = require('async')
var _ = require('underscore')
var EE = require('events').EventEmitter
var walker = require('module-walker')
var make_array = require('make-array')
var mix = require('mix2')
var babel = require('babel-core')

function Builder(options) {
  var self = this
  this._uuid = 0
  this.options = options
  this.cwd = node_path.resolve(options.cwd)
  this.pkg = options.pkg

  this.locals = {}
  this.global_map = {}
}

util.inherits(Builder, EE)


Builder.prototype.parse = function(filename, callback) {
  var self = this
  var resolved = {}
  var pkg = this.pkg
  var locals = this.locals

  async.waterfall([
    done => {
      this._get_dependency_tree(filename, done)
    },
    done => {
      this._collect_modules(done)
    },
    done => {
      this._generate_code(filename, done)
    }
  ], callback)
}


// Gets the dependency tree from the entry file
// @param {String} filename
// @param {function(err, nodes)} callback
Builder.prototype._get_dependency_tree = function(filename, callback) {
  walker({
    allowCyclic: true,
    checkRequireLength: true,
    allowAbsoluteDependency: false,
    extensions: ['.js', '.json'],
    requireResolve: true,
    requireAsync: true,
    commentRequire: true,
    allowNonLiteralRequire: true,
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    sourceType: 'module'
  })
  .on('warn', message => {
    this.emit('warn', message)
  })
  .register(this.options.compilers)
  .walk(filename)
  .then(nodes => {
    this.nodes = nodes
    callback(null)
  }, callback)
}


const REGEX_PACKAGE_NAME = /^[a-z][a-z0-9-_.]*[a-z0-9](?:$|\/)/i
Builder.prototype._check_package_name = function(name) {
  return REGEX_PACKAGE_NAME.test(name)
}


Builder.prototype._get_dependent = function(name, nodes) {
  const ids = Object.keys(nodes)
  const index_found = ids.findIndex((id) => {
    const dependent = nodes[id]
    if (
      (name in dependent.require)
      || (name in dependent.async)
      || (name in dependent.resolve)
    ) {
      return true
    }
  })

  return nodes[ids[index_found]]
}


// Collect all modules which should be bundled into one file
// @param {function(err, codes)} callback
// - codes `Object` the `{<path>: <parsed-module>}` map
Builder.prototype._collect_modules = function(callback) {
  let id
  let node
  let nodes = this.nodes

  for (id in nodes) {
    node = nodes[id]

    if (node.foreign) {
      if (!this._check_package_name(id)) {
        const name = node.id
        const dependent = this._get_dependent(name, nodes)
        const package_name = module_id(name).name

        return callback(new Error(
`invalid package name "${package_name}" in "${dependent.id}"

    A package name should:
      - only contain letters, numbers, dot(.), dash(-), or underscore(_);
      - start with a letter;
      - end with a letter or number.
`
        ))
      }

      continue
    }

    try {
      node.resolved = this._resolve_module_dependencies(id, node)
    } catch (e) {
      if (e.code == 'ENOTINSTALLED') {
        errmsg = 'Explicit version of dependency <%= deps.map(function(dep){return dep}).join(", ") %> <%= deps.length > 1 ? "are" : "is" %> not defined.\n file: <%= file %>'
      } else if (e.code == 'EOUTENTRY') {
        errmsg = 'Relative dependency "<%= deps[0] %>" out of main entry\'s directory. file: <%= file %>'
      } else {
        errmsg = e.message
      }

      e.file = id
      return callback(new Error(_.template(errmsg)(e)))
    }
  }

  callback(null)
}


// @param {String} id Path(file entry) or package name(foreign package)
Builder.prototype._resolve_module_dependencies = function(id, mod) {
  var self = this
  var pkg = this.pkg
  var cwd = this.cwd
  var deps = mod.dependencies
  var resolved = {}

  ;['require', 'resolve', 'async'].forEach(function (key) {
    this._resolve_dependencies(id, mod, mod[key], resolved)
  }, this)

  return resolved
}


// @param {*Object} resolved
Builder.prototype._resolve_dependencies = function(id, mod, deps, resolved) {
  var module_name
  var r
  var real
  var not_installed = []

  for (module_name in deps) {
    real = deps[module_name]

    if (this._is_foreign(real)) {
      // check dependency versions and apply
      // 'jquery' -> 'jquery@^1.9.2'
      r = this._apply_dependency_version(real)

      if (!r) {
        not_installed.push(real)
      }

    } else {
      if (this._out_of_dir(module_name, id)) {
        throw {
          code: 'EOUTENTRY',
          deps: [module_name]
        }
      }
      r = this._generate_module_id(real)
    }

    resolved[module_name] = r
    this._add_to_global_map(module_name, r)
    this._add_locals(r)
  }

  if (not_installed.length) {
    throw {
      code: 'ENOTINSTALLED',
      deps: not_installed
    }
  }
}


Builder.prototype._add_to_global_map = function(key, value) {
  this.global_map[key] = value
}


Builder.prototype._generate_code = function(filename, callback) {
  let options = this.options

  this._wrap_all(this.nodes, (err, code) => {
    if (err) {
      return callback(err)
    }

    if (options.babel) {
      options.babel.filename = filename

      try {
        code = babel.transform(code, options.babel).code
      } catch(e) {
        return callback(e)
      }
    }

    callback(null, this._combile_statements(code))
  })
}


var CODE_TEMPLATE = [
  ';(function(){'         ,
  ''                      ,
  '<%= variables %>'      ,
  '<%= code %>'           ,
  ''                      ,
  '})()'

].join('\n')

Builder.prototype._combile_statements = function(code) {
  var locals = this.locals

  var statements = []
  function declare_varible(name, value, raw) {
    var statement = 'var ' + name + ' = ' + (raw ? value : JSON.stringify(value)) + ''
    if (value) {
      statements.push(statement)
    }
  }

  _.keys(locals).forEach(function(v) {
    declare_varible(locals[v], v)
  })

  declare_varible('global_map', this._stringify(this.global_map), true)

  return _.template(CODE_TEMPLATE)({
    variables: statements.join('\n'),
    code: code
  })
}


Builder.prototype._wrap_all = function(codes, callback) {
  var self = this
  var tasks = _.keys(codes).map(function (id) {
    return function (done) {
      self._wrap(id, codes[id], done)
    }
  })

  async.parallel(tasks, function (err, content_array) {
    if (err) {
      return callback(err)
    }

    callback(null, content_array.filter(Boolean).join('\n\n'))
  })
}


const WRAPPING_TEMPLATE =
    'define(<%= id %>, <%= deps %>, function(require, exports, module, __filename, __dirname) {\n'
  +   '<%= code %>\n'
  + '}<%= module_options ? ", " + module_options : "" %>)'

// Wrap a commonjs module with wrappings so that it could run in browsers
Builder.prototype._wrap = function(filename, mod, callback) {
  // Only wrap modules that have been `require()`d
  if (
    !~mod.type.indexOf('require')

    // do not build foreign packages
    // TODO: option to bundle foreign packages
    || mod.foreign
  ) {
    return callback(null)
  }

  // id
  var module_id = this._generate_module_id(filename)

  // dependencies
  var resolved_dependencies = _.keys(mod.require).map(function (dep) {
    return mod.resolved[dep] || dep
  })

  // options
  var module_options = this._generate_module_options(filename, mod)

  var pairs = []
  if (module_options.main) {
    pairs.push('main: true')
  }

  var different
  var map
  if (module_options.map) {
    different = get_difference(module_options.map, this.global_map)
    map = _.keys(different).length
      ? 'neuron.mix(' + this._stringify(different) + ', global_map)'
      : 'global_map'

    pairs.push('map: ' + map)
  }

  module_options = pairs.length
    ? '{\n'
      + '  ' + pairs.join(',\n  ')
      + '\n}'
    : ''

  var result = _.template(WRAPPING_TEMPLATE)({
    id: this._stringify(module_id),
    deps: this._stringify(resolved_dependencies),
    code: mod.json
      ? 'module.exports = ' + mod.code
      : mod.code,
    module_options: module_options
  })

  callback(null, result)
}


function get_difference (object, relative) {
  var parsed = {}
  var key
  for(key in object){
    if (relative[key] !== object[key]) {
      parsed[key] = object[key]
    }
  }
  return parsed
}


// filename: '/path/to/a.js'
// cwd: '/path'
// -> 'module@0.0.1/to/a.js'
Builder.prototype._generate_module_id = function(filename, relative) {
  // the exact identifier
  var cwd = this.cwd
  var pkg = this.pkg
  var main_id = [pkg.name, pkg.version].join('@')

  var relative_path = relative
    ? filename
    : node_path.relative(cwd, filename)

  // -> 'module@0.0.1/folder/foo'
  var id = node_path.join(main_id, relative_path)

  // fixes windows paths
  id = id
    .replace(new RegExp('\\' + node_path.sep, 'g'), '/')
    .toLowerCase()

  this._add_locals(id)
  return id
}


Builder.prototype._is_foreign = function(str) {
  var isWindowsAbsolute = str.match(/^\w+:\\/)
  var isRelative = ['../', './'].some(function(prefix) {
    return str.indexOf(prefix) === 0
  })
  var isUnixAbsolute = str.indexOf('/') == 0
  return !isRelative && !isUnixAbsolute && !isWindowsAbsolute
}


Builder.prototype._out_of_dir = function(dep, file) {
  var mod_path = node_path.resolve(node_path.join(node_path.dirname(file), dep))
  return mod_path.indexOf(this.cwd) == -1
}


// Returns `Object`
// - main: `Boolean`
// - map: `Object`
Builder.prototype._generate_module_options = function(id, mod) {
  var pkg = this.pkg
  var cwd = this.cwd
  var module_options = {}

  if (
    pkg.main &&
    node_path.resolve(id) === node_path.resolve(cwd, pkg.main)
  ) {
    module_options.main = true
  }

  if (_.keys(mod.resolved).length) {
    module_options.map = mod.resolved
  }

  return module_options
}


Builder.prototype._apply_dependency_version = function(module_name) {
  var pkg = this.pkg

  var module_id
  ['dependencies', 'asyncDependencies', 'devDependencies'].some(function (key) {
    var dependencies = pkg[key]
    if (!dependencies) {
      return
    }
    if (module_name in dependencies) {
      module_id = module_name + '@' + dependencies[module_name]
      return true
    }
  })

  return module_id
    ? module_id

    // If allow implicit dependencies
    : this.options.allow_implicit_dependencies
      ? module_name + '@*'
      : module_id
}


// {
//   '/path/to/a.js': '_0',
//   '/path/to/b.js': '_1'
// }
Builder.prototype._add_locals = function(val) {
  var locals = this.locals
  if (!locals[val]) {
    locals[val] = '_' + this._uuid ++
  }
}


function just_return (subject) {
  return subject
}


// Stringify subject and apply local variables
Builder.prototype._stringify = function(subject) {
  var locals = this.locals

  function to_locals(item) {
    return locals[item]
  }

  if (_.isString(subject)) {
    return to_locals(subject)
  }

  if (_.isArray(subject)) {
    return '[' + subject.map(to_locals).filter(just_return).join(', ') + ']'
  }

  if (_.isObject(subject)) {
    return '{\n'
    + _.keys(subject).map(function(k) {
      var value = to_locals(subject[k])
      return value
        ? '\'' + k + '\'' + ':' + value
        : null

    }).filter(just_return).join(',\n')
    + '\n}'
  }
}
