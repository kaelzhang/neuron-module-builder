var assert = require('assert');
var path = require('path');
var fs = require('fs');
var build = require('../');
var jf = require('jsonfile');
var _ = require('underscore');
var expect = require('chai').expect;
var Parser = build.Parser;
require('should');

function fixture(filepath){
    return path.join(__dirname, "fixtures", filepath);
}

function expected(filepath){
    return path.join(__dirname, "expected", filepath);
}

describe("build", function () {

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
    },
    '/path/to/c.js':{
        code: 'module.exports = "c"'
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
            './a': 'mod@0.1.0/a/index.json',
            b: 'b@0.2.0',
            './c.js': 'mod@0.1.0/c.js'
        }
    },
    '/path/to/c.js': {
        code: 'module.exports = "c"',
        resolved: {}
    },
    '/path/to/a/index.json': {
        dependents: ['/path/to/index.js'],
        dependencies: {},
        code: '{"a":1}',
        resolved: {}
    }
};


var expectedResult = fs.readFileSync(path.join(__dirname, 'expected', 'mock.js'),'utf8');

beforeEach(function () {
    parser = new Parser({
        pkg: {
            "name": "mod",
            "version": "0.1.0",
            "main":"index.js",
            "dependencies": {
                "b": "0.2.0"
            },
            "asyncDependencies": {
                "c": "0.1.5"
            }
        },
        cwd: "/path/to"
    });
});

var locals = {
    "a": "_1",
    "b": "_2",
    "c": "_3"
};

describe("_toLocals", function () {
    var arr = ["a", "b", "c"];
    var obj = {
        "_a": "a",
        "_b": "b",
        "_c": "c"
    };
    beforeEach(function () {
        parser.locals = _.clone(locals);
    });
    it('array', function () {
        var parsed = parser._toLocals(arr);
        expect(parsed).to.equal("[_1,_2,_3]");
    });
    it('array empty locals', function () {
        parser.locals = {};
        var parsed = parser._toLocals(arr);
        expect(parsed).to.equal("[]");
    });
    it('object', function () {
        var parsed = parser._toLocals(obj);
        expect(parsed).to.equal("{\"_a\":_1,\"_b\":_2,\"_c\":_3}");
    });
    it('object empty local', function () {
        parser.locals = {};
        var parsed = parser._toLocals(obj);
        expect(parsed).to.equal("{}");
    });
});

describe("_resolveDeps()", function () {
    it('dependency not installed', function (done) {
        var nodes = {
            '/path/to/index.js': {
                dependents: [],
                entry: true,
                dependencies: {
                    './a': '/path/to/a/index.json',
                    'b': 'b',
                    'd': 'd',
                    './c': '/path/to/c.js'
                },
                code: "var json = require('./a/index.json');var c = require('../c.js');"
            },
            'b':{
                foreign: true
            },
            'd':{
                foreign: true
            },
            '/path/to/a/index.json':{},
            '/path/to/c.js':{}
        };
        parser = new Parser({
            pkg: {
                "name": "mod",
                "version": "0.1.0"
            },
            cwd: "/path/to"
        });
        parser._resolveDeps(_.clone(nodes), function (err) {
            expect(err.message).to.equal('Explicit version of dependency \"b\", \"d\" are not defined in package.json.\n Use \"cortex install b d --save\". file: /path/to/index.js');
            done();
        });
    });

    it('alias not installed', function(done){
        var nodes = {
            '/path/to/index.js': {
                dependents: [],
                entry: true,
                dependencies: {
                    'z': 'y'
                },
                code: "var z = require('z')"
            },
            'y': {
                foreign: true
            }
        };
        parser = new Parser({
            pkg: {
                "name": "mod",
                "version": "0.1.0",
                "dependencies": {}
            },
            cwd: "/path/to"
        });
        parser._resolveDeps(_.clone(nodes), function (err) {
            expect(err.message).to.equal('Explicit version of dependency \"y\" is not defined in package.json.\n Use \"cortex install y --save\". file: /path/to/index.js');
            done();
        });
    })

    it('dependency out of entry\'s directory', function(done){
        var nodes = {
            '/path/to/index.js': {
                dependents: [],
                entry: true,
                dependencies: {
                    './a': '/path/to/a/index.json',
                    'b': 'b',
                    '../c': '/path/c.js'
                },
                code: "var json = require('./a/index.json');var c = require('../c.js');"
            },
            '/path/to/a/index.json':{},
            '/path/c.js':{},
            'b':{foreign:true}
        };
        parser.pkg.dependencies = {};
        parser._resolveDeps(_.clone(nodes), function (err) {
            expect(err.message).to.equal('Relative dependency \"../c\" out of main entry\'s directory. file: /path/to/index.js');
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

describe("_generateModuleOptions()", function(){
    describe("options.main",function(){

        it("specified but not match",function(){
            var mod = {
                entry: true
            };
            parser.pkg.main = "index.json"
            var result = parser._generateModuleOptions("/path/to/index.js", mod);
            expect(result.main).to.not.be.true;
        });

        it("properly",function(){
            var mod = {
                entry: true
            };
            var result = parser._generateModuleOptions("/path/to/index.js", mod);
            expect(result.main).to.be.true;
        });
    });
});

describe("_generateMap()", function () {
    it('properly', function () {
        parser.locals = _.clone(locals);
        var mod = {
            dependencies: {
                './A': '/path/to/A/index.json',
                'b': 'b',
                './c.js': '/path/to/c.js'
            },
            resolved: {
                './A': './A',
                'b': 'b@0.2.0',
                './c.js': './c.js'
            }
        };
        var id = "/path/to/index.js";
        parser.nodes = {
            "b":{foreign:true},
            "/path/to/A/index.json":{},
            "/path/to/c.js":{}
        };
        var map = parser._generateMap(id, _.clone(mod));
        expect(map).to.deep.equal({
            './A': 'mod@0.1.0/a/index.json',
            './c.js': 'mod@0.1.0/c.js'
        });
    });
});

describe("_resolveModuleDependencies()", function(){
    it('properly', function () {
        parser.nodes = {
            "b":{foreign:true},
            "/path/to/A/index.json":{}
        }
        var result = parser._resolveModuleDependencies("/path/to/index.js", {
            dependencies: {
                "b": "b",
                "./A": "/path/to/A/index.json"
            }
        },{
            "b":{foreign:true},
            "/path/to/A/index.json":{}
        });
        expect(result).to.deep.equal({ b: 'b@0.2.0', './A': 'mod@0.1.0/a/index.json' });
    });
});

describe("_generateCode()", function () {
    it('properly', function (done) {
        parser.pkg.entries = ["./pages/list.js","./pages/detail.js"]
        parser._resolveDeps(_.clone(nodes), function (err, codes) {
            parser._generateCode(_.clone(codes), function (err, result) {
                expect(result).to.equal(expectedResult);
                done();
            });
        });
    });
});

describe("parse()", function () {
    var parser;
    beforeEach(function(){
        parser = new Parser({
            pkg : jf.readFileSync(fixture("mixed_package.json")),
            cwd : fixture(".")
        });
    });

    it('parse not installed', function (done) {
        var filepath = fixture("not-installed.js");
        parser.pkg.as = {
          "z": "y"
        }
        parser.parse(filepath, function (err, actual) {
            expect(err.message).to.equal('Explicit version of dependency \"y\" is not defined in package.json.\n'
                + ' Use \"cortex install y --save\". file: /Users/spud/Product/neuron-builder/test/fixtures/not-installed.js');
            done();
        });
    });

    it('simple test', function (done) {
        var filepath = fixture("input.js");

        parser.parse(filepath, function (err, actual) {
            var out = fs.readFileSync( expected('output.js'), 'utf-8');
            expect(actual).to.equal(out);
            done();
        });
    });
});

});