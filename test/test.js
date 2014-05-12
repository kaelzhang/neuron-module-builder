var assert = require('assert');
var path = require('path');
var fs = require('fs');
var parser = require('../');
var jf = require('jsonfile');
var expect = require('chai').expect;
require('should');


describe("parse()", function(){

    var configs = {
        pkg : jf.readFileSync("test/fixtures/mixed_package.json"),
        targetVersion : "latest",
        cwd : path.resolve("./test/fixtures")
    };

    it('simple test', function(done) {
        var filepath = path.resolve('test/fixtures/input.js');

        parser.parse( filepath, configs, function(err, contents){
            var actual = contents.toString();
            var expect = fs.readFileSync('test/expected/output.js','utf-8');
            actual.should.equal(expect);
            done();
        });
    });
    
    it('version not specified', function(done) {
        var filepath = path.resolve('test/fixtures/version-not-specified.js');

        parser.parse( filepath, configs, function(err, contents){
            expect(/Explicit version of dependency \".*\" has not defined in package\.json/.test(err.message)).to.be.true;
            done();
        });
    });


    it('file not exists', function(done) {
        var filepath = path.resolve('test/fixtures/file-not-exists.js');

        parser.parse( filepath, configs, function(err, contents){
            expect(err).to.not.be.null;
            expect(err.message.match("Error reading module")).to.not.be.null;
            done();
        });
    });

    it('file out of entry directory', function(done) {
        var filepath = path.resolve('test/fixtures/file-out-of-entry-dir.js');

        parser.parse( filepath, configs, function(err, contents){
            expect(err).to.not.be.null;
            done();
        });
    });


    it('not fail for self mod', function(done) {
        var filepath = path.resolve('test/fixtures/contain-self.js');

        parser.parse( filepath, {
            pkg : jf.readFileSync("test/fixtures/mixed_package.json"),
            targetVersion : "latest",
            cwd : path.resolve("./test/fixtures"),
            allowNotInstalled: true
        }, function(err, contents){
            expect(err).to.be.null;
            done();
        });
    });


    it('main option', function(done) {
        var filepath = path.resolve('test/fixtures/not-main-entry.js');

        parser.parse( filepath, {
            pkg : jf.readFileSync("test/fixtures/mixed_package.json"),
            targetVersion : "latest",
            cwd : path.resolve("./test/fixtures"),
            allowNotInstalled: true
        }, function(err, contents){
            var actual = contents.toString();
            var expect = fs.readFileSync('test/expected/not-main-entry.js','utf-8');
            actual.should.equal(expect);
            done();
        });
    });

});