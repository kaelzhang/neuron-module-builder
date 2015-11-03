;(function(){

function mix(a, b){
  for(var k in b) {
    a[k] = b[k];
  }
  return a;
}
var _0 = "hello@*/template.jade";
var _1 = "hello@*/lib/index.js";
var _2 = "hello@*/index.js";
var global_map = {
'./template.jade':_0,
'./lib':_1
};
define(_2, [_0, _1], function(require, exports, module, __filename, __dirname) {
'use strict';

var lib = require('./lib')
var template = require('./template.jade');

exports.init = function (data) {
  var html = template(data);
  lib.fill(html);
};

}, {
  main: true,
  map: global_map
});

define(_0, [], function(require, exports, module, __filename, __dirname) {
module.exports = template;
function jade_encode_char(e){return jade_encode_html_rules[e]||e}
var jade_encode_html_rules={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"};
function jade_escape(e){var a=String(e).replace(jade_match_html,jade_encode_char);return a===""+e?e:a}
var jade_match_html=/[&<>"]/g;function template(locals) {var buf = [], jade_mixins = {}, jade_interp;;var locals_for_with = (locals || {});(function (book, name) {buf.push("\u003Ch1\u003EHello, my name is " + (jade_escape((jade_interp = name) == null ? '' : jade_interp)) + "\u003C\u002Fh1\u003E\u003Ch3\u003E\"" + (jade_escape((jade_interp = book.name) == null ? '' : jade_interp)) + "\" for " + (jade_escape((jade_interp = book.price) == null ? '' : jade_interp)) + " €\u003C\u002Fh3\u003E\u003Cul class=\"abc\"\u003E\u003Cli\u003E" + (jade_escape(null == (jade_interp = name) ? "" : jade_interp)) + "\u003C\u002Fli\u003E\u003Cli\u003E" + (jade_escape(null == (jade_interp = name) ? "" : jade_interp)) + "\u003C\u002Fli\u003E\u003C\u002Ful\u003E");}.call(this,"book" in locals_for_with?locals_for_with.book:typeof book!=="undefined"?book:undefined,"name" in locals_for_with?locals_for_with.name:typeof name!=="undefined"?name:undefined));;return buf.join("");}
});

define(_1, [], function(require, exports, module, __filename, __dirname) {
'use strict';

exports.fill = function (html) {
  document.getElementById('container').innerHTML = html
};
});

})();