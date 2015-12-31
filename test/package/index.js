'use strict';

var lib = require('./lib')
var template = require('./template.jade');

exports.init = function (data) {
  var html = template(data);
  lib.fill(html);
};
