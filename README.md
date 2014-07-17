# neuron-builder [![NPM version](https://badge.fury.io/js/neuron-builder.png)](http://badge.fury.io/js/neuron-builder) [![Build Status](https://travis-ci.org/cortexjs/neuron-builder.png?branch=master)](https://travis-ci.org/cortexjs/neuron-builder) [![Dependency Status](https://gemnasium.com/cortexjs/neuron-builder.png)](https://gemnasium.com/cortexjs/neuron-builder)

## Usage

```js
var builder = require('neuron-builder');
```

### builder(options).parse(file, callback)

```js
builder(options)
.on('warn', function(message){
  console.warn(message);
})
.parse(file, callback);
```

#### arguments
- options `Object`
  - pkg: mixed package json format of project
  - targetVersion: target version to build
  - cwd: current working directory
  - allowNotInstalled
  
- file `Path` the parsing file


`callback` will get `err` and `contents` as its arguments, where `contents` is the wrapped result.