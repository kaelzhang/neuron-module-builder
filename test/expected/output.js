(function(){
function mix(a,b){for(var k in b){a[k]=b[k]}}
var _0 = "test-module@0.1.0/input.js";
var _1 = "test-module@0.1.0/c.js";
var _2 = "test-module@0.1.0/d.js";
var _3 = "test-module@0.1.0/folder/child.js";
var _4 = "a@0.0.1";
var _5 = "b@0.0.2";
var entries = [_0,_1,_2,_3];
var asyncDeps = ["c@0.0.3"];
var asyncDepsToMix = {"c":"c@0.0.3"};
define("test-module@0.1.0/input.js", [_4,_5,_1,_2], function(require, exports, module, __filename, __dirname) {
var a = require("a");
var b = require("b");
var c = require("./c");
var d = require("./d");
}, {
    asyncDeps:asyncDeps,
    entries:entries,
    main:true,
    map:mix({"./c":_1,"./d":_2}, asyncDepsToMix)
});

define("test-module@0.1.0/c.js", [_3], function(require, exports, module, __filename, __dirname) {
require("./folder/child");
require.async("./d");
}, {
    asyncDeps:asyncDeps,
    entries:entries,
    map:mix({"./folder/child":_3}, asyncDepsToMix)
});

define("test-module@0.1.0/d.js", [], function(require, exports, module, __filename, __dirname) {
module.exports = function(){
    console.log("I'm d");
};
}, {
    asyncDeps:asyncDeps,
    entries:entries,
    map:asyncDepsToMix
});

define("test-module@0.1.0/folder/child.js", [], function(require, exports, module, __filename, __dirname) {
console.log(1);
}, {
    asyncDeps:asyncDeps,
    entries:entries,
    map:asyncDepsToMix
});
})();