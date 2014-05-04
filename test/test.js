var assert = require('assert');
var path = require('path');
var fs = require('fs');
var parser = require('../');
var jf = require('jsonfile');

require('should');


console.log(parser);

describe("should parse css absolute image path correctly", function(){
    it('should prepend text', function(done) {
        var filepath = path.resolve('test/fixtures/input.js');

        parser.parse( filepath, {
            pkg : jf.readFileSync("test/fixtures/mixed_package.json"),
            targetVersion : "latest",
            cwd : path.resolve("./test/fixtures")
        }, function(err, contents){
            var actual = contents.toString();
            var expect = fs.readFileSync('test/expected/output.js','utf-8');
            actual.should.equal(expect);
            done();
        });
    });
});