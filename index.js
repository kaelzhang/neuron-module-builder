var walker = require('commonjs-walker');
var fs = require('fs');
var path = require('path');
var util = require('util');
var tpl = "define(\"%s\", %s, function(require, exports, module) {\n"
    + "%s\n"
+"}, %s);";


function generateId(filepath,main_id,cwd) {
    // the exact identifier
    var relative_path = path.relative(cwd, filepath);

    // -> 'folder/foo'
    var relative_id = relative_path.replace(/\.js$/, '');

    // -> 'module@0.0.1/folder/foo'
    var id = path.join(main_id, relative_id);
    return id;
}


function isExternalDep(str){
    return ["../",".","/"].every(function(prefix){
        return str.indexOf(prefix) !== 0;
    });
}

// @returns {string} resolved dependencies
function resolveDependency(dep, opt) {
    // suppose:
    //      ['./a', '../../b']
    // `dep` may be relative item, validate it
    var resolved;
    var file = opt.file;
    var deps = opt.deps;

    if(isExternalDep(dep)){
        var version = deps[dep];
        if(!version){
            throw new Error(util.format( 'Explicit version of dependency "%s" has not defined in package.json. Use "cortex install %s --save\nfile: %s".', 
                dep,
                dep,
                opt.file
            ));
        }

        resolved = dep + '@' + version;
    }else{
        resolved = dep;
    }

    return resolved;
}

function generateModuleOptions(mod, pkg){
    var module_options = {};
    var depRef = pkg.asyncDependencies || {};
    var asyncDeps = Object.keys(depRef).map(function(dep){
        return resolveDependency(dep,{
            deps: depRef,
            file: mod.id
        });
    });

    if(asyncDeps.length){
        module_options.asyncDeps = asyncDeps;
    }

    if(mod.isEntryPoint){
        module_options.main = true;
    }

    return module_options;
}

function resolveDependencies(mod, pkg){
    var file = mod.id;
    var mods = mod.unresolvedDependencies;
    return mods.map(function(mod){
        return resolveDependency(mod, {
            deps: pkg.dependencies,
            file: file
        });
    });
}


exports.parse = function(filepath,opt,callback){
    var resolved = {};
    var mainEntry = opt.mainEntry;
    var pkg = opt.pkg;
    var targetVersion = opt.targetVersion;
    var cwd = opt.cwd;
    var main_id = [pkg.name,opt.targetVersion || pkg.version].join("@");

    walker(filepath, {}, function(err, tree, nodes){

        var result = Object.keys(nodes).map(function(key){
            return nodes[key];
        }).filter(function(mod){
            return mod.code;
        }).sort(function(a,b){
            return a.isEntryPoint ? 1 : -1;
        }).map(function(mod){
            var filepath = mod.id;
            var id = generateId(filepath, main_id, cwd);
            var deps = resolveDependencies(mod, pkg);
            var code = mod.code.toString().replace(/\r|\n/g, '\n');
            var module_options = generateModuleOptions(mod, pkg);

            return util.format(tpl,
                id,
                JSON.stringify(deps),
                code,
                JSON.stringify(module_options,null,4)
            );

        }).join("\n");

        callback(null, result);
    });

}