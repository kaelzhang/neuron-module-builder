var assert = require('assert');
var path = require('path');
var fs = require('fs');
var build = require('../');
var jf = require('jsonfile');
var _ = require('underscore');
var expect = require('chai').expect;
var Parser = build.Parser;
require('should');

describe("build",function(){

var parser;
var nodes = {
    '/path/to/index.js': {
        dependents: [],
        entry: true,
        dependencies: {
            './a': '/path/to/a/index.json',
            'b': 'b',
            './c.js': '/path/to/c.js'
        },
        code: "var json = require('./a/index.json');var c = require('./c.js');"
    },
    '/path/to/a/index.json': {
        dependents: [
            '/path/to/index.js'
        ],
        dependencies: {},
        code: '{"a":1}'
    },
    'b': {
        foreign: true,
        dependents: [
            '/path/to/index.js'
        ]
    }
};

var codes = {
    '/path/to/index.js': {
        dependents: [],
        entry: true,
        dependencies: {
            './a': '/path/to/a/index.json',
            b: 'b',
            './c.js': '/path/to/c.js'
        },
        code: 'var json = require(\'./a/index.json\');var c = require(\'./c.js\');',
        resolved: {
            './a': './a',
            b: 'b@0.2.0',
            './c.js': './c.js'
        }
    },
    '/path/to/a/index.json': {
        dependents: ['/path/to/index.js'],
        dependencies: {},
        code: '{"a":1}',
        resolved: {}
    }
};


beforeEach(function () {
    parser = new Parser({
        pkg: {
            "name": "mod",
            "version": "0.1.0",
            "dependencies": {
                "b": "0.2.0"
            },
            "asyncDependencies":{
                "c": "0.1.5"
            }
        },
        cwd: "/path/to"
    });
});


describe("_toLocals",function(){
    beforeEach(function(){
        parser.locals = {
            "a":"_1",
            "b":"_2",
            "c":"_3"
        };
    });
    it('array', function(){
        var parsed = parser._toLocals(["a","b","c"]);
        expect(parsed).to.equal("[_1,_2,_3]");
    });
    it('array empty locals', function(){
        parser.locals = {};
        var parsed = parser._toLocals(["a","b","c"]);
        expect(parsed).to.equal("[]");
    });
    it('object', function(){
        var parsed = parser._toLocals({
            "_a":"a",
            "_b":"b",
            "_c":"c"
        });
        expect(parsed).to.equal("{\"_a\":_1,\"_b\":_2,\"_c\":_3}");
    });
    it('object empty local', function(){
        parser.locals = {};
        var parsed = parser._toLocals({
            "_a":"a",
            "_b":"b",
            "_c":"c"
        });
        expect(parsed).to.equal("{}");
    });
});

describe("_resolveDeps()",function(){
    it('dependency not installed', function (done) {
        parser = new Parser({
            pkg: {
                "name": "mod",
                "version": "0.1.0"
            },
            cwd: "/path/to"
        });
        parser._resolveDeps(_.clone(nodes), function (err) {
            expect(err.message).to.equal('Explicit version of dependency "b" has not defined in package.json. Use "cortex install b --save. file: /path/to/index.js');
            done();
        });
    });

    it('properly', function (done) {
        parser._resolveDeps(_.clone(nodes), function (err, mods) {
            expect(mods).to.deep.equal(codes);
            done();
        });
    });
});


describe("_generateAlias()",function(){
    it('properly', function () {

        // parser._generateAlias(id_.clone(nodes), function (err, mods) {
        //     // expect(mods).to.deep.equal(codes);
        //     done();
        // });
    });
});

describe("_resolveDeps()",function(){
    it('dependency not installed', function (done) {
        parser = new Parser({
            pkg: {
                "name": "mod",
                "version": "0.1.0"
            },
            cwd: "/path/to"
        });
        parser._resolveDeps(_.clone(nodes), function (err) {
            expect(err.message).to.equal('Explicit version of dependency "b" has not defined in package.json. Use "cortex install b --save. file: /path/to/index.js');
            done();
        });
    });

    it('properly', function (done) {
        parser = new Parser({
            pkg: {
                "name": "mod",
                "version": "0.1.0",
                "dependencies": {
                    "b": "0.2.0"
                }
            },
            cwd: "/path/to"
        });
        parser._resolveDeps(_.clone(nodes), function (err, mods) {
            expect(mods).to.deep.equal(codes);
            done();
        });
    });
});


describe("_generateCode()",function(){
    it('properly', function(done){
        parser._resolveDeps(_.clone(nodes),function(err, codes){
            parser._generateCode(_.clone(codes), function(err, result){
                console.log(result);
                done();
            });
        });
    });
});
// describe("parse()", function () {

//     it('simple test', function (done) {
//         var filepath = path.resolve('test/fixtures/input.js');

//         build(filepath, function (err, contents) {
//             var actual = contents.toString();
//             var expect = fs.readFileSync('test/expected/output.js', 'utf-8');
//             actual.should.equal(expect);
//             done();
//         });
//     });

//     it('simple test with upppercase', function (done) {
//         var filepath = path.resolve('test/fixtures/input-with-uppercase.js');
//         var cfg = _.extend({}, configs);
//         cfg.pkg = jf.readFileSync("test/fixtures/mixed-package-with-uppercase.json");

//         build(filepath, cfg, function (err, contents) {
//             var actual = contents.toString();
//             var expect = fs.readFileSync('test/expected/output-with-uppercase.js', 'utf-8');
//             actual.should.equal(expect);
//             done();
//         });
//     });


//     it('version not specified', function (done) {
//         var filepath = path.resolve('test/fixtures/version-not-specified.js');

//         build(filepath, configs, function (err, contents) {
//             expect(/Explicit version of dependency \".*\" has not defined in package\.json/.test(err.message)).to.be.true;
//             done();
//         });
//     });


//     it('file not exists', function (done) {
//         var filepath = path.resolve('test/fixtures/file-not-exists.js');

//         build(filepath, configs, function (err, contents) {
//             expect(err).to.not.be.null;
//             expect(err.message.match("Error reading module")).to.not.be.null;
//             done();
//         });
//     });

//     it('file out of entry directory', function (done) {
//         var filepath = path.resolve('test/fixtures/file-out-of-entry-dir.js');

//         build(filepath, configs, function (err, contents) {
//             expect(err).to.not.be.null;
//             done();
//         });
//     });

//     it('main option', function (done) {
//         var filepath = path.resolve('test/fixtures/not-main-entry.js');

//         build(filepath, {
//             pkg: jf.readFileSync("test/fixtures/mixed_package.json"),
//             cwd: path.resolve("./test/fixtures")
//         }, function (err, contents) {
//             var actual = contents.toString();
//             var expect = fs.readFileSync('test/expected/not-main-entry.js', 'utf-8');
//             actual.should.equal(expect);
//             done();
//         });
//     });

// });

});