'use strict';

module.exports = builder;

// ## Usage
// ```js
// builder(options)
// .on('warn', function () {
// })
// .parse(filepath, callback);
// ```
function builder(options) {
  return new Builder(options || {});
}

builder.Builder = Builder;


var fs = require('fs');
var node_path = require('path');
var util = require('util');
var async = require('async');
var _ = require('underscore');
var EE = require('events').EventEmitter;
var walker = require('commonjs-walker');

function Builder(options) {
  var self = this;
  this._uuid = 0;
  this.options = options;
  this.cwd = node_path.resolve(options.cwd);
  this.pkg = options.pkg;
  this.locals = {};

  this.entries = this.pkg.entries || [];
  this.asyncDependencies = this.pkg.asyncDependencies || {};

  // this.as = this.pkg.as || {};
  // this.loaders = options.loaders;
  // this.loader_version = options.loader_version;

  var asyncDependencies = this.asyncDependencies;
  // var as = this.as;

  this.async_deps_to_mix = {};
  this.global_map = {};
  this.asyncDeps = [];

  this.entries = this.entries.map(function(entry) {
    entry = self._generate_module_id(entry, true);
    self._add_locals(entry);
    return entry;
  });

  // Objects.keys(asyncDependencies).forEach(function(name) {
  //   var version = asyncDependencies[name];
  //   var id = addToAsync(name, version, name);
  //   self.asyncDeps.push(id);
  // });

  // Objects.keys(as).forEach(function(alias) {
  //   var name = as[alias];
  //   var version = asyncDependencies[name];
  //   if (self._is_foreign(alias) && self._is_foreign(name) && asyncDependencies[name]) {
  //     addToAsync(name, version, alias);
  //   }
  // });

  function addToAsync(name, version, key) {
    var id = [name, version].join('@');
    self.async_deps_to_mix[key] = id;
    self._add_locals(id);
    return id;
  }
};

util.inherits(Builder, EE);


Builder.prototype.parse = function(filepath, callback) {
  var self = this;
  var resolved = {};
  var pkg = this.pkg;
  var locals = this.locals;

  async.waterfall([
    function(done) {
      self._get_dependency_tree(filepath, done);
    },
    function(nodes, done) {
      self._collect_modules(nodes, done);
    },
    function(codes, done) {
      self._generate_code(codes, done);
    }
  ], callback);
};


// Gets the dependency tree from the entry file
// @param {String} filepath 
// @param {function(err, nodes)} callback
Builder.prototype._get_dependency_tree = function(filepath, callback) {
  var self = this;
  walker(filepath, {
    allow_cyclic: true,
    check_require_length: true,
    allow_absolute_path: false,
    extensions: ['.js', '.json'],
    require_resolve: true,
    require_async: true

  }, function(err, nodes) {
    if (err) {
      return callback(err);
    }

    self.nodes = nodes;
    callback(null, nodes);
  })
  .on('warn', function(message) {
    self.emit('warn', message);
  });
};


// @param {function(err, codes)} callback
// - codes `Object` the `{<path>: <parsed-module>}` map
Builder.prototype._collect_modules = function(nodes, callback) {
  var codes = {};
  var errmsg = '';
  var id;
  var mod
  for (id in nodes) {
    mod = nodes[id];
    if (mod.foreign) {
      continue;
    }

    try {
      mod.resolved = this._resolve_module_dependencies(id, mod);
    } catch (e) {
      if (e.code == 'ENOTINSTALLED') {
        errmsg = 'Explicit version of dependency <%= deps.map(function(dep){return '\'' + dep + '\''}).join(\', \') %> <%= deps.length > 1 ? 'are' : 'is' %> not defined in package.json.\n Use \'cortex install <%= deps.join(' ') %> --save\'. file: <%= file %>';
      } else if (e.code == 'EOUTENTRY') {
        errmsg = 'Relative dependency \'<%= deps[0] %>\' out of main entry\'s directory. file: <%= file %>';
      } else {
        errmsg = e.message;
      }
      e.file = id;
      return callback(new Error(_.template(errmsg)(e)));
    }

    codes[id] = mod;
  }

  callback(null, codes);
};


var CODE_TEMPLATE = 
  ';(function(){\n' + 
    'function mix(a, b){ for(var k in b) { a[k]=b[k]; } return a; }\n' + 
    '<%= variables %>' + 
    '<%= code %>\n' + 
  '})();';

Builder.prototype._generate_code = function(codes, callback) {
  var self = this;
  var locals = this.locals;
  var code = _.keys(codes).map(function(id) {
    var mod = codes[id];
    return self._wrap(id, mod);
  }).join('\n\n');

  var variables = [];

  function declareVarible(name, value, raw) {
    var statement = 'var ' + name + ' = ' + (raw ? value : JSON.stringify(value)) + ';\n';
    if (value) {
      variables.push(statement);
    }
  }

  _.keys(locals).forEach(function(v) {
    declareVarible(locals[v], v);
  });

  ['entries', 'asyncDeps', 'async_deps_to_mix'].forEach(function(key) {
    var value = self[key];
    (key == 'async_deps_to_mix' || value.length) && declareVarible(key, self._to_locals(value), true);
  });
  declareVarible('global_map', _.keys(self.global_map).length ? ('mix(' + self._to_locals(self.global_map) + ',async_deps_to_mix)') : 'async_deps_to_mix', true)
  code = _.template(CODE_TEMPLATE)({
    variables: variables.join(''),
    code: code
  });

  callback(null, code);
};


Builder.prototype._wrap = function(id, mod) {
  var self = this;
  var pkg = this.pkg;
  var opt = this.options;
  var filepath = id;
  var entries = this.entries;
  var resolvedDeps = _.values(mod.resolved);
  var module_options = this._generateModuleOptions(id, mod);
  var id = this._generate_module_id(filepath);
  var code = mod.code.toString().replace(/\r\n/g, '\n');
  var template = 'define(<%= id %>, <%= deps %>, function(require, exports, module, __filename, __dirname) {\n' + '<%= code %>\n' + '}<%= module_options ? module_options : '' %>);';

  function optionsToString(module_options) {
    var pairs = [];
    for (var key in module_options) {
      var value = module_options[key];
      value = ({
        'asyncDeps': 'asyncDeps',
        'entries': 'entries',
        'map': _.keys(value).length ? ('mix(' + self._to_locals(value) + ',global_map)') : 'global_map',
        'main': 'true'
      })[key];

      pairs.push(key + ':' + value);
    }
    return pairs.length ? (', {\n\t' + pairs.join(',\n\t') + '\n}').replace(/\t/g, '    ') : '';
  }

  module_options = optionsToString(module_options);

  var result = _.template(template)({
    id: self._to_locals(id),
    deps: this._to_locals(resolvedDeps),
    code: this._dealCode(id, code),
    module_options: module_options
  });

  return result;
};


Builder.prototype.dealCode = function(id, code) {
  if (node_path.extname(id) == '.json') {
    return 'module.exports = ' + code;
  } else {
    return code;
  }
};


Builder.prototype._generate_module_id = function(filepath, relative) {
  // the exact identifier
  var cwd = this.cwd;
  var pkg = this.pkg;
  var main_id = [pkg.name, pkg.version].join('@');

  var relative_path = relative
    ? filepath 
    : node_path.relative(cwd, filepath);

  // -> 'module@0.0.1/folder/foo'
  var id = node_path.join(main_id, relative_path);

  // fixes windows paths
  id = id.replace(new RegExp('\\' + node_path.sep, 'g'), '/');

  id = id.toLowerCase();
  this._add_locals(id);
  return id;
};


Builder.prototype._is_foreign = function(str) {
  var isWindowsAbsolute = str.match(/^\w+:\\/);
  var isRelative = ['../', './'].some(function(prefix) {
    return str.indexOf(prefix) === 0;
  });
  var isUnixAbsolute = str.indexOf('/') == 0;
  return !isRelative && !isUnixAbsolute && !isWindowsAbsolute;
};


Builder.prototype._out_of_dir = function(dep, file) {
  var mod_path = node_path.resolve(node_path.join(node_path.dirname(file), dep));
  return mod_node_path.indexOf(this.cwd) == -1;
};


Builder.prototype._generateModuleOptions = function(id, mod) {
  var self = this;
  var pkg = this.pkg;
  var cwd = this.cwd;
  var entries = this.entries;
  var asyncDeps = this.asyncDeps;
  var module_options = {};
  if (asyncDeps.length) {
    module_options.asyncDeps = true;
  }

  if (entries.length) {
    module_options.entries = true;
  }

  if (pkg.main && mod.entry && node_path.resolve(id) === node_path.resolve(cwd, pkg.main)) {
    module_options.main = true;
  }

  var map = this._generateMap(id, mod);
  module_options.map = map;


  return _.keys(module_options).length ? module_options : null;
};


Builder.prototype._generateMap = function(id, mod) {
  var self = this;
  var resolved = mod.resolved;
  var dependencies = mod.dependencies;
  var resolvedDeps = _.keys(resolved);
  var map = {};
  var nodes = this.nodes;
  var as = this.pkg.as || {};
  resolvedDeps.forEach(function(dep) {
    // to lower cases
    // resolve dir
    var result;
    var realDependency = dependencies[dep];

    if (!self._is_foreign(realDependency)) {
      result = realDependency.toLowerCase();
      result = self._generate_module_id(realDependency);
    } else if (as[dep]) {
      result = self._apply_dependency_version(realDependency);
      self.global_map[realDependency] = result;
    }

    if (result) {
      map[dep] = result;
      self._add_locals(result);
    }
  });
  return map;
};


Builder.prototype._apply_dependency_version = function(module_name) {
  var pkg = this.pkg;
  var deps = ['dependencies', 'asyncDependencies', 'devDependencies'];
  for (var i = 0; i < deps.length; i++) {
    var dep = deps[i];
    if (pkg[dep] && pkg[dep][module_name]) {
      return module_name + '@' + pkg[dep][module_name];
    }
  }
  return false;
};


// @param {String} id Path(file entry) or package name(foreign package)
Builder.prototype._resolve_module_dependencies = function(id, mod) {
  var self = this;
  var pkg = this.pkg;
  var cwd = this.cwd;
  var deps = mod.dependencies;
  var notInstalled = [];
  var resolved = {};

  this._resolve_dependencies(id, mod, mod.require, resolved);
  this._resolve_dependencies(id, mod, mod.resolve, resolved);
  this._resolve_dependencies(id, mod, mod.async, resolved);

  return resolved;
};


// @param {*Object} resolved
Builder.prototype._resolve_dependencies = function(id, mod, deps, resolved) {
  var module_name;
  var r;
  var real;
  var not_installed = [];

  for (module_name in deps) {
    real = deps[module_name];

    if (self._is_foreign(real)) {
      // check dependency versions and apply
      // 'jquery' -> 'jquery@^1.9.2'
      r = self._apply_dependency_version(real);

      if (!r) {
        not_installed.push(real);
      }

    } else {
      if (self._out_of_dir(module_name, id)) {
        throw {
          code: 'EOUTENTRY',
          deps: [module_name]
        };
      }
      r = self._generate_module_id(real);
    }

    resolved[module_name] = r;
    self._add_locals(r);
  }

  if (not_installed.length) {
    throw {
      code: 'ENOTINSTALLED',
      deps: not_installed
    }
  }
};


// {
//   '/path/to/a.js': '_0',
//   '/path/to/b.js': '_1'
// }
Builder.prototype._add_locals = function(val) {
  var locals = this.locals;
  if (!locals[val]) {
    locals[val] = '_' + this._uuid ++;
  }
};


function not_null (subject) {
  return subject !== null;
}

Builder.prototype._to_locals = function(obj) {
  var locals = this.locals;

  function toLocals(item) {
    return locals[item] || null;
  }

  if (_.isString(obj)) {
    return toLocals(obj);
  }

  if (_.isArray(obj)) {
    return '[' + obj.map(toLocals).filter(notNull).join(',') + ']'
  };

  if (_.isObject(obj)) {
    return '{' + _.keys(obj).map(function(k) {
      var value = toLocals(obj[k]);
      return value ? (''' + k + ''' + ':' + value) : null
    }).filter(notNull).join(',') + '}';
  }
};
