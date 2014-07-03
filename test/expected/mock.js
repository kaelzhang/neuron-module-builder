(function(){
function mix(a,b){for(var k in b){a[k]=b[k]}}
var _0 = "mod@0.1.0/a/index.json";
var _1 = "b@0.2.0";
var _2 = "mod@0.1.0/c.js";
var asyncDeps = ["c@0.1.5"];
var asyncDepsToMix = {"c":"c@0.1.5"};
define("mod@0.1.0/index.js", [_0,_1,_2], function(require, exports, module) {
var json = require('./a/index.json');var c = require('./c.js');
}, {
    asyncDeps:asyncDeps,
    main:true,
    map:mix({"./a":_0,"./c.js":_2}, asyncDepsToMix)
});

define("mod@0.1.0/a/index.json", [], function(require, exports, module) {
module.exports = {"a":1}
}, {
    asyncDeps:asyncDeps,
    map:asyncDepsToMix
});
})();