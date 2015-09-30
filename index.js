'use strict';

module.exports = builder;

// ## Usage
// ```js
// builder(options)
// .on('warn', function () {
// })
// .parse(filename, callback);
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


Builder.prototype.parse = function(filename, callback) {
  var self = this;
  var resolved = {};
  var pkg = this.pkg;
  var locals = this.locals;

  async.waterfall([
    function(done) {
      self._get_dependency_tree(filename, done);
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
// @param {String} filename 
// @param {function(err, nodes)} callback
Builder.prototype._get_dependency_tree = function(filename, callback) {
  var self = this;
  walker(filename, {
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

  ['require', 'resolve', 'async'].forEach(function (key) {
    this._resolve_dependencies(id, mod, mod[key], resolved);
  }, this);

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


var CODE_TEMPLATE = [
  ';(function(){'         ,
  ''                      ,
  'function mix(a, b){'   , 
  '  for(var k in b) {'   ,
  '    a[k] = b[k];'      ,
  '  }'                   ,
  '  return a;'           ,
  '}'                     ,
  '<%= variables %>'      , 
  '<%= code %>'           ,
  ''                      ,
  '})();'

].join('\n');

Builder.prototype._generate_code = function(codes, callback) {
  var self = this;
  var locals = this.locals;
  var code = _.keys(codes).map(function(id) {
    var mod = codes[id];
    return self._wrap(id, mod);

  }).join('\n\n');

  var statements = [];
  function declare_varible(name, value, raw) {
    var statement = 'var ' + name + ' = ' + (raw ? value : JSON.stringify(value)) + ';';
    if (value) {
      statements.push(statement);
    }
  }

  _.keys(locals).forEach(function(v) {
    declare_varible(locals[v], v);
  });

  // ['entries', 'asyncDeps', 'async_deps_to_mix'].forEach(function(key) {
  //   var value = self[key];
  //   (key == 'async_deps_to_mix' || value.length) && declare_varible(key, self._to_locals(value), true);
  // });

  // declare_varible(
  //   'global_map', 
  //   _.keys(self.global_map).length 
  //     ? 'mix(' + self._to_locals(self.global_map) + ',async_deps_to_mix)'
  //     : 'async_deps_to_mix', true
  // );

  code = _.template(CODE_TEMPLATE)({
    variables: statements.join('\n'),
    code: code
  });

  callback(null, code);
};


var WRAPPING_TEMPLATE = 
    'define(<%= id %>, <%= deps %>, function(require, exports, module, __filename, __dirname) {\n' 
  +   '<%= code %>\n'
  + '}<%= module_options ? ", " + module_options : "" %>);';

// Wrap a commonjs module with wrappings so that it could run in browsers
Builder.prototype._wrap = function(filename, mod, callback) {
  // id
  var module_id = this._generate_module_id(filename);

  // dependencies
  var resolved_dependencies = _.keys(mod.require).map(function (dep) {
    return mod.resolved[dep] || dep;
  });

  // options
  var module_options = this._generate_module_options(id, mod);

  var pairs = [];
  var key;
  var value;
  for (key in module_options) {
    var value = module_options[key];
    value = ({
      'map': _.keys(value).length ? ('mix(' + self._to_locals(value) + ', global_map)') : 'global_map',
      'main': 'true'
    })[key];

    pairs.push(key + ':' + value);
  }
  
  module_options = pairs.length
    ? '{\n'
      + '  ' + pairs.join(',\n  ')
      + '\n}'

    : '';

  var self = this;
  this._get_compiled_content(filename, function (err, content) {
    if (err) {
      return callback(err);
    }

    var result = _.template(WRAPPING_TEMPLATE)({
      id: self._to_locals(module_id),
      deps: self._to_locals(resolved_dependencies),
      code: content,
      module_options: module_options
    });

    callback(null, result);
  });
};


Builder.prototype._get_compiled_content = function(filename, callback) {
  var self = this;
  this._get_content(filename, function (err, content) {
    if (err) {
      return callback(err);
    }

    self._compile(filename, content, callback);
  });
};


Builder.prototype._get_content = function(filename, callback) {
  fs.readFile(filename, function (err, content) {
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
Builder.prototype._compile = function(filename, content, callback) {
  var tasks = this.compilers.filter(function (c) {
    return c.pattern.test(filename);
  
  }).reduce(function (c, i) {
    return function (content, done) {
      var options = mix({
        // adds `filename` to options of each compiler
        filename: filename

      }, c.options, false);
      c.compiler(content, options, done);
    };

  }, [init]);

  // If no registered compilers, just return
  function init (done) {
    done(null, content);
  }

  async.waterfall(tasks, callback);
};


// filename: '/path/to/a.js'
// cwd: '/path'
// -> 'module@0.0.1/to/a.js'
Builder.prototype._generate_module_id = function(filename, relative) {
  // the exact identifier
  var cwd = this.cwd;
  var pkg = this.pkg;
  var main_id = [pkg.name, pkg.version].join('@');

  var relative_path = relative
    ? filename 
    : node_path.relative(cwd, filename);

  // -> 'module@0.0.1/folder/foo'
  var id = node_path.join(main_id, relative_path);

  // fixes windows paths
  id = id
    .replace(new RegExp('\\' + node_path.sep, 'g'), '/')
    .toLowerCase();

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


// Returns `Object`
// - main: `Boolean`
// - map: `Object`
Builder.prototype._generate_module_options = function(id, mod) {
  var pkg = this.pkg;
  var cwd = this.cwd;
  var module_options = {};

  if (pkg.main && mod.entry && node_path.resolve(id) === node_path.resolve(cwd, pkg.main)) {
    module_options.main = true;
  }

  if (_.keys(mod.resolved).length) {
    module_options.map = mod.resolved;
  }

  return _.keys(module_options).length
    ? module_options
    : null;
};


Builder.prototype._apply_dependency_version = function(module_name) {
  var pkg = this.pkg;

  var module_id;
  ['dependencies', 'asyncDependencies', 'devDependencies'].some(function (key) {
    var dependencies = pkg[key];
    if (!dependencies) {
      return;
    }
    if (module_name in dependencies) {
      module_id = module_name + '@' + dependencies[module_name];
      return true;
    }
  });

  return module_id;
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
