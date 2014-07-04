"use strict";
var fs = require('fs');
var path = require('path');
var util = require('util');
var async = require('async');
var path = require('path');
var _ = require('underscore');

var Parser = function (opt) {
    var self = this;
    this._uuid = 0;
    this.opt = opt;
    this.cwd = opt.cwd;
    this.pkg = opt.pkg;
    this.locals = {};
    this.entries = this.pkg.entries || [];
    this.asyncDependencies = this.pkg.asyncDependencies || {};

    var asyncDepRef = this.asyncDependencies;
    this.asyncDepsToMix = {};
    this.asyncDeps = [];

    this.entries = this.entries.map(function(entry){
        entry = self._generateId(entry, true);
        self._addLocals(entry);
        return entry;
    });

    _.keys(asyncDepRef).forEach(function (name) {
        var version = asyncDepRef[name];
        var id = [name, version].join("@");
        self.asyncDeps.push(id);
        self.asyncDepsToMix[name] = id;
    });
};

Parser.prototype.parse = function (filepath, callback) {
    var self = this;
    var resolved = {};
    var pkg = this.pkg;
    var locals = this.locals;

    async.waterfall([

        function (done) {
            self._getDeps(filepath, pkg, done);
        },
        this._resolveDeps.bind(this),
        this._generateCode.bind(this)
    ], callback);
}

Parser.prototype._resolveDeps = function (nodes, callback) {
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
            if(e.code == "ENOTINSTALLED"){
                errmsg = "Explicit version of dependency <%= deps.map(function(dep){return '\"' + dep + '\"'}).join(\", \") %> are not defined in package.json.\n Use \"cortex install <%= deps.join(' ') %> --save\". file: <%= file %>";
            }else if(e.code == "EOUTENTRY"){
                errmsg = "Relative dependency \"<%= deps[0] %>\" out of main entry\'s directory. file: <%= file %>";
            }else{
                errmsg = e.message;
            }
            e.file = id;
            return callback(new Error(_.template(errmsg,e)));
        }
        codes[id] = mod;
    }


    callback(null, codes);
};

Parser.prototype._generateCode = function (codes, callback) {
    var self = this;
    var locals = this.locals;
    var code = _.keys(codes).map(function (id) {
        var mod = codes[id];
        return self._wrapping(id, mod);
    }).join("\n\n");
    var variables = [];
    var template = "(function(){\n"
        + "function mix(a,b){for(var k in b){a[k]=b[k];return a;}}\n"
        + "<%= variables %>"
        + "<%= code %>\n"
    + "})();";

    function declareVarible(name, value, raw){
        var statement = 'var ' + name + ' = ' + (raw ? value : JSON.stringify(value)) + ';\n';
        if(value){
            variables.push(statement);
        }
    }

    _.keys(locals).forEach(function (v) {
        declareVarible(locals[v],v);
    });

    this.entries.length && declareVarible("entries", this._toLocals(this.entries) ,true);
    this.asyncDeps.length && declareVarible("asyncDeps", this.asyncDeps);
    declareVarible("asyncDepsToMix",this.asyncDepsToMix);

    code = _.template(template, {
        variables: variables.join(""),
        code: code
    });

    callback(null, code);
}

Parser.prototype._getDeps = function (filepath, pkg, callback) {
    var walker = require('commonjs-walker');
    walker(filepath, {
      detectCyclic: true,
      strictRequire: true,
      allowAbsolutePath: false,
      extensions: ['.js', '.json'],
      'as': pkg['as'] || {}

    }, function (err, nodes) {
        callback(err, nodes);
    });
};

Parser.prototype._wrapping = function (id, mod) {
    var self = this;
    var pkg = this.pkg;
    var opt = this.opt;
    var filepath = id;
    var entries = this.entries;
    var resolvedDeps = _.values(mod.resolved);
    var module_options = this._generateModuleOptions(id, mod);
    var id = this._generateId(filepath);
    var code = mod.code.toString();
    var template ="define(\"<%= id %>\", <%= deps %>, function(require, exports, module, __filename, __dirname) {\n"
        + "<%= code %>\n"
    + "}<%= module_options ? module_options : '' %>);";


    function optionsToString(module_options) {
        var pairs = [];
        for (var key in module_options) {
            var value = module_options[key];
            value = ({
                "asyncDeps": "asyncDeps",
                "entries": "entries",
                "map": _.keys(value).length ? ("mix(" + self._toLocals(value) + ", asyncDepsToMix)") : "asyncDepsToMix",
                "main": "true"
            })[key];

            pairs.push(key + ":" + value);
        }
        return pairs.length ? (", {\n\t" + pairs.join(",\n\t") + "\n}").replace(/\t/g,"    "): "";
    }

    module_options = optionsToString(module_options);

    var result = _.template(template, {
        id: id,
        deps: this._toLocals(resolvedDeps),
        code: path.extname(id) == ".json" ? ("module.exports = " + code) : code,
        module_options: module_options
    });

    return result
};


Parser.prototype._generateId = function (filepath, relative) {
    // the exact identifier
    var cwd = this.cwd;
    var pkg = this.pkg;
    var main_id = [pkg.name, pkg.version].join("@");
    var relative_path = relative ? filepath : path.relative(cwd, filepath);

    // -> 'module@0.0.1/folder/foo'
    var id = path.join(main_id, relative_path);
    return id;
}


Parser.prototype._isExternalDep = function (str) {
    return ["../", ".", "/"].every(function (prefix) {
        return str.indexOf(prefix) !== 0;
    });
}

Parser.prototype._outOfDir = function (dep, file) {
    var cwd = this.cwd;
    var mod_path = path.join(path.dirname(file), dep);

    return mod_path.indexOf(cwd) == -1;
}

Parser.prototype._generateModuleOptions = function (id, mod) {
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

    if (mod.entry && id === path.join(cwd, pkg.main)) {
        module_options.main = true;
    }

    var map = this._generateMap(id, mod);
    module_options.map = map;


    return _.keys(module_options).length ? module_options : null;
}

Parser.prototype._generateMap = function (id, mod) {
    var self = this;
    var resolved = mod.resolved;
    var dependencies = mod.dependencies;
    var resolvedDeps = _.keys(resolved);
    var map = {};
    resolvedDeps.forEach(function (dep) {
        // to lower cases
        // resolve dir
        var result;
        if (!self._isExternalDep(dep)) {
            result = path.relative(path.dirname(id), dependencies[dep]);
            if (result.indexOf(".") !== 0) {
                result = "./" + result;
            }
            result = result.toLowerCase();
            // if(result !== dep){
            result =  self._generateId( result, true );
            map[dep] = result;
            self._addLocals(result);
            // }
        }
    });
    return map;
};

Parser.prototype._resolveModuleDependencies = function (id, mod) {
    var self = this;
    var pkg = this.pkg;
    var cwd = this.cwd;
    var deps = mod.dependencies;
    var notInstalled = [];
    var resolvedDeps = {};
    for (var mod in deps) {
        var opt = self.opt;
        var resolved;

        if (self._isExternalDep(mod)) {
            var version = (pkg.dependencies && pkg.dependencies[mod]) || (pkg.devDependencies && pkg.devDependencies[mod]);
            if (!version) {
                notInstalled.push(mod);
            }
            resolved = mod + '@' + version;

        } else {
            if (self._outOfDir(mod, id)) {
                throw {
                    code: "EOUTENTRY",
                    deps: [mod]
                };
            }
            resolved = self._generateId(deps[mod]);
        }
        resolvedDeps[mod] = resolved;
        self._addLocals(resolved);
    }

    if(notInstalled.length){
        throw {
            code: "ENOTINSTALLED",
            deps: notInstalled
        }
    }

    return resolvedDeps;
}

Parser.prototype._addLocals = function (val) {
    var locals = this.locals;
    if (!locals[val]) {
        locals[val] = "_" + this._uuid;
        this._uuid++;
    }
}

Parser.prototype._toLocals = function (obj) {
    var locals = this.locals;

    function toLocals(item) {
        return locals[item] || null;
    }

    function notNull(item) {
        return item !== null;
    }

    if (_.isArray(obj)) {
        return '[' + obj.map(toLocals).filter(notNull).join(",") + ']'
    };

    if (_.isObject(obj)) {
        return '{' + _.keys(obj).map(function (k) {
            var value = toLocals(obj[k]);
            return value ? ('"' + k + '"' + ':' + value) : null
        }).filter(notNull).join(',') + '}';
    }
}


module.exports = function (filepath, opt, callback) {
    var parser = new Parser(opt);
    parser.parse(filepath, callback);
}

module.exports.Parser = Parser;