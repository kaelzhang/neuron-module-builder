var walker = require('commonjs-walker');
var fs = require('fs');
var path = require('path');
var util = require('util');
var tpl = "define(\"%s\", %s, function(require, exports, module) {\n"
    + "%s\n"
+"}, %s);";

var Parser = function(){};

Parser.prototype.parse = function(filepath,opt,callback){
    var self = this;
    var resolved = {};
    var mainEntry = opt.mainEntry;
    var pkg = opt.pkg;
    var targetVersion = opt.targetVersion;
    var main_id = [pkg.name, opt.targetVersion || pkg.version].join("@");
    var allowNotInstalled = opt.allowNotInstalled;


    this.opt = opt;
    this.cwd = opt.cwd;
    this.pkg = opt.pkg;

    walker(filepath, {}, function(err, tree, nodes){
        if(err){
            return callback(err);
        }
        var result;
        try{
            result = Object.keys(nodes).map(function(key){
                return nodes[key];
            }).filter(function(mod){
                return mod.code;
            }).sort(function(a,b){
                return a.isEntryPoint ? 1 : -1;
            }).map(function(mod){
                var filepath = mod.id;
                var id = self.generateId(filepath, main_id);
                var deps = self.resolveDependencies(mod);
                var code = mod.code.toString().replace(/\r|\n/g, '\n');
                var module_options = self.generateModuleOptions(mod);

                return util.format(tpl,
                    id,
                    JSON.stringify(deps),
                    code,
                    JSON.stringify(module_options,null,4)
                );

            }).join("\n");
        }catch(e){
            return callback(e)
        }

        callback(null, result);
    });
}



Parser.prototype.generateId = function(filepath,main_id,cwd) {
    // the exact identifier
    var cwd = this.cwd;
    var relative_path = path.relative(cwd, filepath);

    // -> 'folder/foo'
    var relative_id = relative_path.replace(/\.js$/, '');

    // -> 'module@0.0.1/folder/foo'
    var id = path.join(main_id, relative_id);
    return id;
}


Parser.prototype.isExternalDep = function(str){
    return ["../",".","/"].every(function(prefix){
        return str.indexOf(prefix) !== 0;
    });
}

Parser.prototype.outOfDir = function(dep, file){
    var cwd = this.cwd;
    var mod_path = path.join( path.dirname(file), dep);

    return mod_path.indexOf(cwd) == -1;
}


// @returns {string} resolved dependencies
Parser.prototype.resolveDependency = function(dep, deps, file) {
    // suppose:
    //      ['./a', '../../b']
    // `dep` may be relative item, validate it
    var opt = this.opt;
    var resolved;

    if(this.isExternalDep(dep)){
        var version = deps[dep];
        if(!version && opt.allowNotInstalled){
            version = "latest";
        }
        if(!version){
            throw new Error(util.format('Explicit version of dependency "%s" has not defined in package.json. Use "cortex install %s --save.',dep,dep));
        }
        resolved = dep + '@' + version;
    }else{
        if(this.outOfDir(dep, file)){
            throw new Error(util.format( 'Relative dependency "%s" out of main entry\'s directory.',dep));
        }
        resolved = dep;
    }

    return resolved;
}

Parser.prototype.generateModuleOptions = function(mod){
    var self = this;
    var pkg = this.pkg;
    var cwd = this.cwd;
    var module_options = {};
    var depRef = pkg.asyncDependencies || {};
    var asyncDeps = Object.keys(depRef).map(function(dep){
        return self.resolveDependency(dep,depRef,mod.id);
    });

    if(asyncDeps.length){
        module_options.asyncDeps = asyncDeps;
    }

    if(mod.isEntryPoint){
        module_options.main = true;
    }

    return module_options;
}

Parser.prototype.resolveDependencies = function(mod){
    var self = this;
    var pkg = this.pkg;
    var cwd = this.cwd;
    var file = mod.id;
    var mods = mod.unresolvedDependencies;
    return mods.map(function(mod){
        return self.resolveDependency(mod, pkg.dependencies,file);
    });
}


module.exports = new Parser();