'use strict';

var node_path = require('path');
var builder = require('../');
var expect = require('chai').expect;
var fs = require('fs');
var fse = require('fs-extra');
var jade_compiler = require('neuron-jade-compiler');

var pkg = {
  "name": "hello",
  "version": "*",
  "main": "index.js",
  "dependencies": {
    "a": "^0.2.0"
  },
  "asyncDependencies": {
    "b": "^0.1.5"
  }
};
var cwd = node_path.join(__dirname, 'package');

describe("builder", function(){
  it("simple", function(done){
    var entry = node_path.join(__dirname, 'package/index.js');

    builder(entry, {
      pkg: pkg,
      cwd: cwd,
      compilers: [
        {
          test: '.jade',
          compiler: jade_compiler
        }
      ]
    }, function (err, content) {
      if (err) {
        console.log(err.stack);
        expect(true).to.equal(false);
        return done();
      }

      var output = node_path.join(__dirname, 'package/mod/hello/*/hello.js');
      fse.outputFile(output, content, function (err) {
        expect(err).to.equal(null);
        done();
      });
    });
  });
});