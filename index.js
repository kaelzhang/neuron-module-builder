'use strict';

module.exports = builder;

// ## Usage
// ```js
// builder(options)
// .on('warn', function () {
  
// })
// .parse(filepath, callback);
// ```
function builder (options) {
  return new Parser(options || {});
}

builder.Builder = Parser;


var fs = require('fs');
var path = require('path');
var util = require('util');
var async = require('async');
var path = require('path');
var _ = require('underscore');
var EE = require('events').EventEmitter;

function Parser (opt) {
  var self = this;
  this._uuid = 0;
  this.opt = opt;
  this.cwd = opt.cwd;
  this.pkg = opt.pkg;
  this.locals = {};
  this.entries = this.pkg.entries || [];
  this.asyncDependencies = this.pkg.asyncDependencies || {};
  this.as = this.pkg.as || {};

  var asyncDependencies = this.asyncDependencies;
  var as = this.as;

  this.asyncDepsToMix = {};
  this.globalMap = {};
  this.asyncDeps = [];

  this.entries = this.entries.map(function(entry) {
    entry = self._generateId(entry, true);
    self._addLocals(entry);
    return entry;
  });

  _.keys(asyncDependencies).forEach(function(name) {
    var version = asyncDependencies[name];
    var id = addToAsync(name, version, name);
    self.asyncDeps.push(id);
  });

  _.keys(as).forEach(function(alias) {
    var name = as[alias];
    var version = asyncDependencies[name];
    if (self._isForeign(alias) && self._isForeign(name) && asyncDependencies[name]) {
      addToAsync(name, version, alias);
    }
  });

  function addToAsync(name, version, key) {
    var id = [name, version].join("@");
    self.asyncDepsToMix[key] = id;
    self._addLocals(id);
    return id;
  }
};

util.inherits(Parser, EE);


Parser.prototype.parse = function(filepath, callback) {
  var self = this;
  var resolved = {};
  var pkg = this.pkg;
  var locals = this.locals;

  async.waterfall([

    function(done) {
      self._getDeps(filepath, done);
    },
    this._resolveDeps.bind(this),
    this._generateCode.bind(this)
  ], callback);
}

Parser.prototype._resolveDeps = function(nodes, callback) {
  this.nodes = nodes;
  var codes = {};
  var errmsg = "";
  for (var id in nodes) {
    var mod = nodes[id];
    if (mod.foreign) {
      continue;
    }

    try {
      mod.resolved = this._resolveModuleDependencies(id, mod);
    } catch (e) {
      if (e.code == "ENOTINSTALLED") {
        errmsg = "Explicit version of dependency <%= deps.map(function(dep){return '\"' + dep + '\"'}).join(\", \") %> <%= deps.length > 1 ? 'are' : 'is' %> not defined in package.json.\n Use \"cortex install <%= deps.join(' ') %> --save\". file: <%= file %>";
      } else if (e.code == "EOUTENTRY") {
        errmsg = "Relative dependency \"<%= deps[0] %>\" out of main entry\'s directory. file: <%= file %>";
      } else {
        errmsg = e.message;
      }
      e.file = id;
      return callback(new Error(_.template(errmsg, e)));
    }
    codes[id] = mod;
  }


  callback(null, codes);
};

Parser.prototype._generateCode = function(codes, callback) {
  var self = this;
  var locals = this.locals;
  var code = _.keys(codes).map(function(id) {
    var mod = codes[id];
    return self._wrapping(id, mod);
  }).join("\n\n");
  var variables = [];
  var template = "(function(){\n" + "function mix(a,b){for(var k in b){a[k]=b[k];}return a;}\n" + "<%= variables %>" + "<%= code %>\n" + "})();";

  function declareVarible(name, value, raw) {
    var statement = 'var ' + name + ' = ' + (raw ? value : JSON.stringify(value)) + ';\n';
    if (value) {
      variables.push(statement);
    }
  }

  _.keys(locals).forEach(function(v) {
    declareVarible(locals[v], v);
  });

  ["entries", "asyncDeps", "asyncDepsToMix"].forEach(function(key) {
    var value = self[key];
    (key == "asyncDepsToMix" || value.length) && declareVarible(key, self._toLocals(value), true);
  });
  declareVarible("globalMap", _.keys(self.globalMap).length ? ("mix(" + self._toLocals(self.globalMap) + ",asyncDepsToMix)") : "asyncDepsToMix", true)
  code = _.template(template, {
    variables: variables.join(""),
    code: code
  });

  callback(null, code);
}

Parser.prototype._getDeps = function(filepath, callback) {
  var self = this;
  var walker = require('commonjs-walker');
  var pkg = this.pkg;
  walker(filepath, {
    allowCyclic: false,
    strictRequire: true,
    allowAbsolutePath: false,
    extensions: ['.js', '.json'],
    cwd: self.cwd,
    'as': pkg['as'] || {}
  }, callback)
  .on('warn', function (message) {
    self.emit('warn', message);
  })
  .walk();
};

Parser.prototype._wrapping = function(id, mod) {
  var self = this;
  var pkg = this.pkg;
  var opt = this.opt;
  var filepath = id;
  var entries = this.entries;
  var resolvedDeps = _.values(mod.resolved);
  var module_options = this._generateModuleOptions(id, mod);
  var id = this._generateId(filepath);
  var code = mod.code.toString().replace(/\r\n/g, '\n');
  var template = "define(<%= id %>, <%= deps %>, function(require, exports, module, __filename, __dirname) {\n" + "<%= code %>\n" + "}<%= module_options ? module_options : '' %>);";

  function optionsToString(module_options) {
    var pairs = [];
    for (var key in module_options) {
      var value = module_options[key];
      value = ({
        "asyncDeps": "asyncDeps",
        "entries": "entries",
        "map": _.keys(value).length ? ("mix(globalMap," + self._toLocals(value) + ")") : "globalMap",
        "main": "true"
      })[key];

      pairs.push(key + ":" + value);
    }
    return pairs.length ? (", {\n\t" + pairs.join(",\n\t") + "\n}").replace(/\t/g, "    ") : "";
  }

  module_options = optionsToString(module_options);

  var result = _.template(template, {
    id: self._toLocals(id),
    deps: this._toLocals(resolvedDeps),
    code: path.extname(id) == ".json" ? ("module.exports = " + code) : code,
    module_options: module_options
  });

  return result
};


Parser.prototype._generateId = function(filepath, relative) {
  // the exact identifier
  var cwd = this.cwd;
  var pkg = this.pkg;
  var main_id = [pkg.name, pkg.version].join("@");
  var reg = new RegExp("\\" + path.sep, "g");
  var relative_path = relative ? filepath : path.relative(cwd, filepath);

  // -> 'module@0.0.1/folder/foo'
  var id = path.join(main_id, relative_path);
  id = id.replace(reg, "/");
  id = id.toLowerCase();
  this._addLocals(id);
  return id;
}


Parser.prototype._isForeign = function(str) {
  var isWindowsAbsolute = str.match(/^\w+:\\/);
  var isRelative = ["../", "./"].some(function(prefix) {
    return str.indexOf(prefix) === 0;
  });
  var isUnixAbsolute = str.indexOf("/") == 0;
  return !isRelative && !isUnixAbsolute && !isWindowsAbsolute;
}

Parser.prototype._outOfDir = function(dep, file) {
  var cwd = path.resolve(this.cwd);
  var mod_path = path.resolve(path.join(path.dirname(file), dep));
  return mod_path.indexOf(cwd) == -1;
}

Parser.prototype._generateModuleOptions = function(id, mod) {
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

  if (pkg.main && mod.entry && path.resolve(id) === path.resolve(cwd, pkg.main)) {
    module_options.main = true;
  }

  var map = this._generateMap(id, mod);
  module_options.map = map;


  return _.keys(module_options).length ? module_options : null;
}

Parser.prototype._generateMap = function(id, mod) {
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

    if (!self._isForeign(realDependency)) {
      result = realDependency.toLowerCase();
      result = self._generateId(realDependency);
    } else if (as[dep]) {
      result = self._resolveForeignDependency(realDependency);
      self.globalMap[realDependency] = result;
    }

    if (result) {
      map[dep] = result;
      self._addLocals(result);
    }
  });
  return map;
};

Parser.prototype._resolveForeignDependency = function(module_name) {
  var pkg = this.pkg;
  var deps = ["dependencies", "asyncDependencies", "devDependencies"];
  for (var i = 0; i < deps.length; i++) {
    var dep = deps[i];
    if (pkg[dep] && pkg[dep][module_name]) {
      return module_name + "@" + pkg[dep][module_name];
    }
  }
  return false;
};

Parser.prototype._resolveModuleDependencies = function(id, mod) {
  var self = this;
  var pkg = this.pkg;
  var cwd = this.cwd;
  var deps = mod.dependencies;
  var notInstalled = [];
  var resolvedDeps = {};

  for (var module_name in deps) {
    var opt = self.opt;
    var resolved;
    var realDependency = deps[module_name];

    if (self._isForeign(realDependency)) {
      resolved = self._resolveForeignDependency(realDependency);
      if (!resolved) {
        notInstalled.push(realDependency);
      }

    } else {
      if (self._outOfDir(module_name, id)) {
        throw {
          code: "EOUTENTRY",
          deps: [module_name]
        };
      }
      resolved = self._generateId(deps[module_name]);
    }
    resolvedDeps[module_name] = resolved;
    self._addLocals(resolved);
  }

  if (notInstalled.length) {
    throw {
      code: "ENOTINSTALLED",
      deps: notInstalled
    }
  }

  return resolvedDeps;
}

Parser.prototype._addLocals = function(val) {
  var locals = this.locals;
  if (!locals[val]) {
    locals[val] = "_" + this._uuid;
    this._uuid++;
  }
}

Parser.prototype._toLocals = function(obj) {
  var locals = this.locals;

  function toLocals(item) {
    return locals[item] || null;
  }

  function notNull(item) {
    return item !== null;
  }
  if (_.isString(obj)) {
    return toLocals(obj);
  }

  if (_.isArray(obj)) {
    return '[' + obj.map(toLocals).filter(notNull).join(",") + ']'
  };

  if (_.isObject(obj)) {
    return '{' + _.keys(obj).map(function(k) {
      var value = toLocals(obj[k]);
      return value ? ('"' + k + '"' + ':' + value) : null
    }).filter(notNull).join(',') + '}';
  }
}
