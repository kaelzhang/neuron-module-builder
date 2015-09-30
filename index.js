'use strict';

module.exports = builder;

// ## Usage
// ```js
// builder(options)
// .on('warn', function () {
// })
// .parse(filepath, callback);
// ```
function builder(entry, options, callback) {
  make_sure(options, 'pkg');
  make_sure(options, 'cwd');
  new Builder(options || {}).parse(entry, callback);
}


function make_sure (options, key) {
  if (key in options) {
    return;
  }

  throw new Error('`options.' + key + '` must be defined');
}


builder.Builder = Builder;

var fs = require('fs');
var node_path = require('path');
var util = require('util');
var async = require('async');
var _ = require('underscore');
var EE = require('events').EventEmitter;
var walker = require('commonjs-walker');
var make_array = require('make-array');
var mix = require('mix2');

function Builder(options) {
  var self = this;
  this._uuid = 0;
  this.options = options;
  this.cwd = node_path.resolve(options.cwd);
  this.pkg = options.pkg;
  this.locals = {};
  this.compilers = [];
  this.global_map = {};
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
    function(codes, done) { console.log(codes);
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


// Collect all modules which should be bundled into one file
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
        errmsg = 'Explicit version of dependency <%= deps.map(function(dep){return dep}).join(", ") %> <%= deps.length > 1 ? "are" : "is" %> not defined in package.json.\n Use "cortex install <%= deps.join(" ") %> --save". file: <%= file %>';
      } else if (e.code == 'EOUTENTRY') {
        errmsg = 'Relative dependency "<%= deps[0] %>" out of main entry\'s directory. file: <%= file %>';
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


// @param {String} id Path(file entry) or package name(foreign package)
Builder.prototype._resolve_module_dependencies = function(id, mod) {
  var self = this;
  var pkg = this.pkg;
  var cwd = this.cwd;
  var deps = mod.dependencies;
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

    if (this._is_foreign(real)) {
      // check dependency versions and apply
      // 'jquery' -> 'jquery@^1.9.2'
      r = this._apply_dependency_version(real);

      if (!r) {
        not_installed.push(real);
      }

    } else {
      if (this._out_of_dir(module_name, id)) {
        throw {
          code: 'EOUTENTRY',
          deps: [module_name]
        };
      }
      r = this._generate_module_id(real);
    }

    resolved[module_name] = r;
    this._add_locals(r);
  }

  if (not_installed.length) {
    throw {
      code: 'ENOTINSTALLED',
      deps: not_installed
    }
  }
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

  var statements = [];

  function declare_varible(name, value, raw) {
    var statement = 'var ' + name + ' = ' + (raw ? value : JSON.stringify(value)) + ';\n';
    if (value) {
      statements.push(statement);
    }
  }

  _.keys(locals).forEach(function(v) {
    declare_varible(locals[v], v);
  });

  ['entries', 'asyncDeps', 'async_deps_to_mix'].forEach(function(key) {
    var value = self[key];
    (key == 'async_deps_to_mix' || value.length) && declare_varible(key, self._to_locals(value), true);
  });
  declare_varible(
    'global_map', 
    _.keys(self.global_map).length 
      ? 'mix(' + self._to_locals(self.global_map) + ',async_deps_to_mix)'
      : 'async_deps_to_mix', true
  );
  
  code = _.template(CODE_TEMPLATE)({
    variables: variables.join(''),
    code: code
  });

  callback(null, code);
};


Builder.prototype._wrap = function(id, mod, callback) {
  var self = this;
  var pkg = this.pkg;
  var opt = this.options;
  var filepath = id;
  var resolvedDeps = _.values(mod.resolved);
  var module_options = this._generateModuleOptions(id, mod);
  var id = this._generate_module_id(filepath);
  var code = mod.code.toString().replace(/\r\n/g, '\n');
  var template = 'define(<%= id %>, <%= deps %>, function(require, exports, module, __filename, __dirname) {\n' 
    +   '<%= code %>\n'
    + '}<%= module_options ? module_options : "" %>);';

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


Builder.prototype._get_content = function(filepath, callback) {
  fs.readFile(filepath, function (err, content) {
    callback(err, content && content.toString());
  });
};


// @param {string|RegExp} pattern
// @param {Object|Array.<Object>} new_compilers
// - compiler: `function(content, options, callback)`
// - options:
// - pattern:
Builder.prototype.register = function(pattern, new_compilers) {
  new_compilers = make_array(new_compilers);

  var compilers = this.compilers;
  new_compilers.forEach(function (c) {
    c.pattern = util.isRegExp(c.pattern)
      ? c.pattern
      : new RegExp(c.pattern);

    compilers.push(c);
  });

  return this;
};


// Applies all compilers to process the file content
Builder.prototype._compile = function(filepath, content, callback) {
  var tasks = this.compilers.filter(function (c) {
    return c.pattern.test(filepath);
  
  }).reduce(function (c, i) {
    return function (content, done) {
      var options = mix({
        // adds `filepath` to options of each compiler
        filepath: filepath

      }, c.options, false);
      c.compiler(content, options, done);
    };

  }, [init]);

  function init (done) {
    done(null, content);
  }

  async.waterfall(tasks, callback);
};


Builder.prototype.dealCode = function(id, code) {
  if (node_path.extname(id) == '.json') {
    return 'module.exports = ' + code;
  } else {
    return code;
  }
};


// filepath: '/path/to/a.js'
// cwd: '/path'
// -> 'module@0.0.1/to/a.js'
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
  return mod_path.indexOf(this.cwd) == -1;
};


Builder.prototype._generateModuleOptions = function(id, mod) {
  var self = this;
  var pkg = this.pkg;
  var cwd = this.cwd;
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

  function to_locals(item) {
    return locals[item] || null;
  }

  if (_.isString(obj)) {
    return to_locals(obj);
  }

  if (_.isArray(obj)) {
    return '[' + obj.map(to_locals).filter(notNull).join(',') + ']'
  };

  if (_.isObject(obj)) {
    return '{' + _.keys(obj).map(function(k) {
      var value = to_locals(obj[k]);
      return value ? ('"' + k + '"' + ':' + value) : null
    }).filter(notNull).join(',') + '}';
  }
};
