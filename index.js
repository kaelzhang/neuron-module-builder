"use strict";
var fs = require('fs');
var path = require('path');
var util = require('util');
var async = require('async');
var path = require('path');
var _ = require('underscore');

var Parser = function (opt) {
    this._uuid = 0;

    this.opt = opt;
    this.cwd = opt.cwd;
    this.pkg = opt.pkg;
    this.locals = {};

    var asyncDepRef = this.pkg.asyncDependencies || {};

    this.asyncDeps = Object.keys(asyncDepRef).map(function (name) {
        var version = asyncDepRef[name];
        return [name, version].join("@");
    });
};

Parser.prototype.parse = function (filepath, callback) {
    var self = this;
    var resolved = {};
    var pkg = this.pkg;
    var locals = this.locals;

    async.waterfall([

        function (done) {
            self._getDeps(filepath, done);
        },
        this._resolveDeps,
        this._generateCode
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
    }).join("\n");
    var template = "(function(){\n" + "<%= locals %>" + "<%= asyncDeps %>" + "<%= code %>" + "})();";

    locals = _.keys(locals).map(function (v) {
        return locals[v] + '="' + v + '"';
    }).join(",");
    locals = locals ? ('var ' + locals + ';\n') : '';

    var asyncDeps = this.asyncDeps;
    asyncDeps = asyncDeps.length ? ('var asyncDeps=' + JSON.stringify(asyncDeps) + ';\n') : '';

    code = _.template(template, {
        locals: locals,
        asyncDeps: asyncDeps,
        code: code
    });

    callback(null, code);
}

Parser.prototype._getDeps = function (filepath, callback) {
    var walker = require('commonjs-walker');
    walker(filepath, walker.OPTIONS.BROWSER, function (err, nodes) {
        console.log(nodes);
        callback(err, nodes);
    });
};

Parser.prototype._wrapping = function (id, mod) {
    var self = this;
    var pkg = this.pkg;
    var opt = this.opt;
    var filepath = id;
    var resolvedDeps = _.values(mod.resolved);
    var module_options = this._generateModuleOptions(id, mod);
    var id = this._generateId(filepath);
    var code = mod.code.toString().replace();
    var template ="define(\"<%= id %>\", <%= deps %>, function(require, exports, module) {\n" + "<%= code %>\n" + "}<%= module_options ? module_options : '' %>);";


    function optionsToString(module_options) {
        var pairs = [];
        for (var key in module_options) {
            var value = module_options[key];
            value = ({
                "asyncDeps": "asyncDeps",
                "alias": self._toLocals(value),
                "main": "true"
            })[key];

            pairs.push(key + ":" + value);
        }
        return pairs.length ? (", {" + pairs.join(",") + "}") : "";
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


Parser.prototype._generateId = function (filepath) {
    // the exact identifier
    var cwd = this.cwd;
    var pkg = this.pkg;
    var main_id = [pkg.name, pkg.version].join("@");
    var relative_path = path.relative(cwd, filepath);

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
    var asyncDeps = this.asyncDeps;
    var module_options = {};
    if (asyncDeps.length) {
        module_options.asyncDeps = true;
    }

    if (mod.entry && id === path.join(cwd, pkg.main)) {
        module_options.main = true;
    }

    var alias = this._generateAlias(id, mod);
    if (Object.keys(alias).length) {
        module_options.alias = alias;
    }


    return _.keys(module_options).length ? module_options : null;
}

Parser.prototype._generateAlias = function (id, mod) {
    var self = this;
    var resolved = mod.resolved;
    var dependencies = mod.dependencies;
    var resolvedDeps = _.keys(resolved);
    var alias = {};
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
            alias[dep] = result;
            self._addLocals(result);
            // }
        }
    });
    return alias;
};

Parser.prototype._resolveModuleDependencies = function (id, mod) {
    var self = this;
    var pkg = this.pkg;
    var cwd = this.cwd;
    var deps = mod.dependencies;
    var notInstalled = [];
    var resolvedDeps = {};
    for (var mod in deps) {
        var absolute_path = deps[mod];
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
            resolved = mod;
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