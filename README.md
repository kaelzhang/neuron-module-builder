# neuron-builder [![NPM version](https://badge.fury.io/js/neuron-builder.png)](http://badge.fury.io/js/neuron-builder) [![Build Status](https://travis-ci.org/cortexjs/neuron-builder.png?branch=master)](https://travis-ci.org/cortexjs/neuron-builder) [![Dependency Status](https://gemnasium.com/cortexjs/neuron-builder.png)](https://gemnasium.com/cortexjs/neuron-builder)

## Usage

```js
var builder = require('neuron-builder');

builder(file, options, callback)
  .on('warn', function(message){
    console.warn(message);
  });
```

- options `Object`
  - pkg: mixed package json format of project
  - targetVersion: target version to build
  - cwd: current working directory

### builder(entry, callback)

- entry `String` the pathname of the entry file to be parsed from
- callback `function(err, content, parsed)`

`callback` will get `err`, `contents` and `parsed` as its arguments, where:

- err `Error`
- content `String` the parsed content
- parsed `Object` the dict which contains all infomations

#### arguments
  
- file `Path` the parsing file


