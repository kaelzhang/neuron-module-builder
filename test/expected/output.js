(function(){
function mix(a,b){for(var k in b){a[k]=b[k];return a;}}
var _0 = "test-module@0.1.0/input.js";
var _1 = "test-module@0.1.0/c.js";
var _2 = "test-module@0.1.0/d.js";
var _3 = "test-module@0.1.0/folder/child.js";
var _4 = "c@0.0.3";
var _5 = "a@0.0.1";
var _6 = "b@0.0.2";
var entries = [_0,_1,_2,_3];
var asyncDeps = [_4];
var asyncDepsToMix = {"c":_4};
define(_0, [_5,_6,_1,_2], function(require, exports, module, __filename, __dirname) {
var a = require("a");
var b = require("b");
var c = require("./C");
var d = require("./d");
}, {
    asyncDeps:asyncDeps,
    entries:entries,
    main:true,
    map:mix({"./C":_1,"./d":_2}, asyncDepsToMix)
});

define(_1, [_3], function(require, exports, module, __filename, __dirname) {
require("./folder/child");
require.async("./d");
}, {
    asyncDeps:asyncDeps,
    entries:entries,
    map:mix({"./folder/child":_3}, asyncDepsToMix)
});

define(_2, [], function(require, exports, module, __filename, __dirname) {
module.exports = function(){
    console.log("I'm d");
};
}, {
    asyncDeps:asyncDeps,
    entries:entries,
    map:asyncDepsToMix
});

define(_3, [], function(require, exports, module, __filename, __dirname) {
console.log(1);
}, {
    asyncDeps:asyncDeps,
    entries:entries,
    map:asyncDepsToMix
});
})();