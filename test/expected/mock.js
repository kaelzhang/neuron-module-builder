(function(){
var _0="./a",_1="b@0.2.0",_2="./c.js",_3="./a/index.json";
var asyncDeps=["c@0.1.5"];
define("mod@0.1.0/index.js", [_0,_1,_2], function(require, exports, module) {
var json = require('./a/index.json');var c = require('./c.js');
}, {asyncDeps:asyncDeps,main:true,alias:{"./a":_3,"./c.js":_2}});
define("mod@0.1.0/a/index.json", [], function(require, exports, module) {
module.exports = {"a":1}
}, {asyncDeps:asyncDeps});})();