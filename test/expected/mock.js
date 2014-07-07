(function(){
function mix(a,b){for(var k in b){a[k]=b[k];}return a;}
var _0 = "c@0.1.5";
var _1 = "mod@0.1.0/a/index.json";
var _2 = "b@0.2.0";
var _3 = "mod@0.1.0/c.js";
var _4 = "mod@0.1.0/index.js";
var asyncDeps = [_0];
var asyncDepsToMix = {"c":_0};
var globalMap = mix({},asyncDepsToMix);
define(_4, [_1,_2,_3], function(require, exports, module, __filename, __dirname) {
var json = require('./a/index.json');var c = require('./c.js');
}, {
    asyncDeps:asyncDeps,
    main:true,
    map:mix(globalMap,{"./a":_1,"./c.js":_3})
});

define(_1, [], function(require, exports, module, __filename, __dirname) {
module.exports = {"a":1}
}, {
    asyncDeps:asyncDeps,
    map:globalMap
});

define(_3, [], function(require, exports, module, __filename, __dirname) {
module.exports = "c"
}, {
    asyncDeps:asyncDeps,
    map:globalMap
});
})();