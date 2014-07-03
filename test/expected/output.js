(function(){
function mix(a,b){for(var k in b){a[k]=b[k]}}
var _0 = "a@0.0.1";
var _1 = "b@0.0.2";
var _2 = "test-module@0.1.0/c.js";
var _3 = "test-module@0.1.0/d.js";
var _4 = "test-module@0.1.0/folder/child.js";
var entries = ["input.js","c.js","d.js","folder/child.js"];
var asyncDeps = ["c@0.0.3"];
var asyncDepsToMix = {"c":"c@0.0.3"};
define("test-module@0.1.0/input.js", [_0,_1,_2,_3], function(require, exports, module) {
var a = require("a");
var b = require("b");
var c = require("./c");
var d = require("./d");
}, {
    asyncDeps:asyncDeps,
    entries:entries,
    main:true,
    map:mix({"./c":_2,"./d":_3}, asyncDepsToMix)
});

define("test-module@0.1.0/c.js", [_4], function(require, exports, module) {
require("./folder/child");
require.async("./d");
}, {
    asyncDeps:asyncDeps,
    entries:entries,
    map:mix({"./folder/child":_4}, asyncDepsToMix)
});

define("test-module@0.1.0/d.js", [], function(require, exports, module) {
module.exports = function(){
    console.log("I'm d");
};
}, {
    asyncDeps:asyncDeps,
    entries:entries,
    map:asyncDepsToMix
});

define("test-module@0.1.0/folder/child.js", [], function(require, exports, module) {
console.log(1);
}, {
    asyncDeps:asyncDeps,
    entries:entries,
    map:asyncDepsToMix
});
})();