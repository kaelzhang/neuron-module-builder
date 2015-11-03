(function(ENV){


/**
 * @preserve Neuron JavaScript Framework (c) Kael Zhang <i@kael.me>
 */

// Goal
// Manage module dependencies and initialization 

// Non-goal
// > What neuron will never do
// 1. Neuron will never care about non-browser environment
// 2. Neuron core will never care about module loading

'use strict';

var neuron = {
  version: '10.0.3'
};

var NULL = null;
var FALSE = !1;

// // Check and make sure the module is downloaded, 
// // if not, it will download the module
// neuron.load = function (module, callback){
//   callback();
// }


// common code slice
//////////////////////////////////////////////////////////////////////
// - constants
// - common methods

// @const
// 'a@1.2.3/abc' -> 
// ['a@1.2.3/abc', 'a', '1.2.3', '/abc']

//                    0 1                2         3
var REGEX_PARSE_ID = /^((?:[^\/])+?)(?:@([^\/]+))?(\/.*)?$/;
// On android 2.2,
// `[^\/]+?` will fail to do the lazy match, but `(?:[^\/])+?` works.
// Shit, go to hell!

// Parses a module id into an object

// @param {string} id path-resolved module identifier
// 'a@1.0.0'    -> 'a@1.0.0'
// 'a'          -> 'a@*'
// 'a/inner'    -> 'a@*/inner'
function parse_module_id (id) {
  var match = id.match(REGEX_PARSE_ID);
  var name = match[1];

  // 'a/inner' -> 'a@latest/inner'
  var version = match[2] || '*';
  var path = match[3] || '';

  // There always be matches
  return format_parsed({
    n: name,
    v: version,
    p: path
  });
}


// Format package id and pkg
// `parsed` -> 'a@1.1.0'
function format_parsed (parsed) {
  var pkg = parsed.n + '@' + parsed.v;
  parsed.id = pkg + parsed.p;
  parsed.k = pkg;
  return parsed;
}


// A very simple `mix` method
// copy all properties in the supplier to the receiver
// @param {Object} receiver
// @param {Object} supplier
// @returns {mixed} receiver
function mix (receiver, supplier) {
  for (var c in supplier) {
    receiver[c] = supplier[c];
  }
}


// greedy match:
var REGEX_DIR_MATCHER = /.*(?=\/.*$)/;

// Get the current directory from the location
//
// http://jsperf.com/regex-vs-split/2
// vs: http://jsperf.com/regex-vs-split
function dirname (uri) {
  var m = uri.match(REGEX_DIR_MATCHER);

  // abc/def  -> abc
  // abc      -> abc  // which is different with `path.dirname` of node.js
  // abc/     -> abc
  return m ? m[0] : uri;
}


// @param {string} path
function is_path_relative (path) {
  return path.indexOf('./') === 0 || path.indexOf('../') === 0;
}


function err (message) {
  throw new Error('neuron: ' + message);
}


function module_not_found (id) {
  err("Cannot find module '" + id + "'");
}


// ## A very simple EventEmitter
//////////////////////////////////////////////////////////////////////

var events = {};

// @param {this} self
// @param {string} type
// @returns {Array.<function()>}
function get_event_storage_by_type (type) {
  return events[type] || (events[type] = []);
}


// Register an event once
function on (type, fn) {
  get_event_storage_by_type(type).push(fn);
}


// Emits an event
function emit (type, data) {
  var handlers = get_event_storage_by_type(type);
  handlers.forEach(function (handler) {
    handler(data);
  });
}


// ## Neuron Core: Module Manager
//////////////////////////////////////////////////////////////////////

// ## CommonJS
// Neuron 3.x or newer is not the implementation of any CommonJs proposals
// but only [module/1.0](http://wiki.commonjs.org/wiki/Modules/1.0), one of the stable CommonJs standards.
// And by using neuron and [cortex](http://github.com/cortexjs/cortex), user could write module/1.0 modules.
// Just FORGET `define`.

// ## Naming Conventions of Variables
// All naming of variables should accord to this.

// Take `'a@1.0.0/relative'` for example:

// ### package 
// The package which the current module belongs to.
// - name or package name:  {string} package `name`: 'a'
// - package or package id: {string} contains package `name` and `version` and the splitter `'@'`. 
//   'a@1.0.0' for instance.

// ### module
// A package is consist of several module objects.
// - mod: {object} the module object. use `mod` instead of `module` to avoid confliction
// - id or module id: the descripter that contains package name, version, and path information
//      {string} for example, `'a@1.0.0/relative'` is a module id(entifier)

// ### version
// Package version: '1.0.0'

// ### main entry
// The module of a package that designed to be accessed from the outside

// ### shadow module and module
// A single module may have different contexts and runtime results
// - mod: the original module definition, including factory function, dependencies and so on
// - module: the shadow module, which is inherited from `mod`

////////////////////////////////////////////////////////////////////////////////////////////////


// Parse an id within an environment, and do range mapping, resolving, applying aliases.
// Returns {Object} parsed object
// @param {string} id
// @param {Object=} env the environment module
function parse_id (id, env) {
  var origin = id;

  // commonjs parser could not parse non-literal argument of `require`
  // So, users might pass a null value into `require()`
  id || err('null id');

  env || (env = {});
  var map = env.map || {};

  // 3 kinds of id:
  // - relative module path
  // - package name
  // - a module with path loaded by `facade` or `neuron._use`

  // './a' -> 'module@1.0.0/a.js'
  // 'jquery' -> 'jquery'
  id = map[id] || id;

  // If the `id` is still a relative path,
  // there must be something wrong.
  // For most cases, 
  is_path_relative(id) && module_not_found(origin);

  // Adds version to a package name
  // 'jquery' -> 'jquery@^1.9.3'
  id = env.m && env.m[id] || id;

  // 'jquery' -> {n: 'jquery', v: '*', p: ''}
  // 'jquery@^1.9.3' -> {n: 'jquery', v: '^1.9.3', p: ''}
  var parsed = parse_module_id(id);
  
  if (parsed.k === env.k) {
    // if inside the same package of the parent module,
    // it uses a same sub graph of the package
    parsed.graph = env.graph;

  } else {
    // We route a package of certain range to a specific version according to `config.graph`
    // so several modules may point to a same exports
    // if is foreign module, we should parses the graph to the the sub graph
    // For more details about graph, see '../doc/graph.md'
    var sub_graph = get_sub_graph(parsed.k, env.graph) 
      // If sub_graph not found, set it as `[]`
      || [];
    parsed.graph = sub_graph;
    parsed.v = sub_graph[0] || parsed.v;
    format_parsed(parsed);
  }

  return parsed;
}


function get_sub_graph (pkg, graph) {
  var global_graph = NEURON_CONF.graph._;
  var deps = graph
    ? graph[1]
    // If `graph` is undefined, fallback to global_graph
    : global_graph;

  return deps && (pkg in deps)
    // `deps[pkg]` is the graph id for the subtle graph
    ? NEURON_CONF.graph[deps[pkg]]
    : global_graph;
}


// Get the exports
// @param {Object} module
function get_exports (module) {
  // Since 6.0.0, neuron will not emit a "cyclic" event.
  // But, detecing static cyclic dependencies is a piece of cake for compilers, 
  // such as [cortex](http://github.com/cortexjs/cortex)
  return module.loaded
    ? module.exports

    // #82: since 4.5.0, a module only initialize factory functions when `require()`d.
    : generate_exports(module);
}


// Generate the exports of the module
function generate_exports (module) {
  // # 85
  // Before module factory being invoked, mark the module as `loaded`
  // so we will not execute the factory function again.
  
  // `mod.loaded` indicates that a module has already been `require()`d
  // When there are cyclic dependencies, neuron will not fail.
  module.loaded = true;

  // During the execution of factory, 
  // the reference of `module.exports` might be changed.
  // But we still set the `module.exports` as `{}`, 
  // because the module might be `require()`d during the execution of factory 
  // if cyclic dependency occurs.
  var exports = module.exports = {};

  // TODO:
  // Calculate `filename` ahead of time
  var __filename
    // = module.filename 
    = NEURON_CONF.resolve(module.id);
  var __dirname = dirname(__filename);

  // to keep the object mod away from the executing context of factory,
  // use `factory` instead `mod.factory`,
  // preventing user from fetching runtime data by 'this'
  var factory = module.factory;
  factory(create_require(module), exports, module, __filename, __dirname);
  return module.exports;
}


var guid = 1;

// Get a shadow module or create a new one if not exists
// facade({ entry: 'a' })
function get_module (id, env, strict) {
  var parsed = parse_id(id, env);
  var graph = parsed.graph;
  var mod = get_mod(parsed);

  var real_id = mod.main
    // if is main module, then use `pkg` as `real_id`
    ? parsed.k
    : parsed.id;

  // `graph` is the list of modules for a certain package
  var module = graph[real_id];

  if (!module) {
    !strict || module_not_found(id);
    // So that `module` could be linked with a unique graph
    module = graph[real_id] = create_shadow_module(mod);
    module.graph = graph;

    // guid
    module.g || (module.g = guid ++);
  }

  return module;
}


// @param {Object} module
// @param {function(exports)} callback
function use_module (module, callback) {
  ready(module, function () {
    callback(get_exports(module));
  });
}


// Create a mod
function get_mod (parsed) {
  var id = parsed.id;
  return mods[id] || (mods[id] = {
    // package name: 'a'
    n: parsed.n,
    // package version: '1.1.0'
    v: parsed.v,
    // module path: '/b'
    p: parsed.p,
    // module id: 'a@1.1.0/b'
    id: id,
    // package id: 'a@1.1.0'
    k: parsed.k,
    // version map of the current module
    m: {},
    // loading queue
    l: [],
    // If no path, it must be a main entry.
    // Actually, it actually won't happen when defining a module
    main: !parsed.p
    // map: {Object} The map of aliases to real module id
  });
}


// @param {Object} mod Defined data of mod
function create_shadow_module (mod) {
  function F () {
    // callbacks
    this.r = [];
  }
  F.prototype = mod;
  return new F;
}


// Since 4.2.0, neuron would not allow to require an id with version
// TODO:
// for scoped packages
function prohibit_require_id_with_version (id) {
  !~id.indexOf('@') || err("id with '@' is prohibited");
}


// use the sandbox to specify the environment for every id that required in the current module 
// @param {Object} env The object of the current module.
// @return {function}
function create_require (env) {
  function require (id) {
    // `require('a@0.0.0')` is prohibited.
    prohibit_require_id_with_version(id);

    var module = get_module(id, env, true);
    return get_exports(module);
  }

  // @param {string} id Module identifier. 
  // Since 4.2.0, we only allow to asynchronously load a single module
  require.async = function(id, callback) {
    if (callback) {
      // `require.async('a@0.0.0')` is prohibited
      prohibit_require_id_with_version(id);
      var module = get_module(id, env);

      // If `require.async` a foreign module, it must be a main entry
      if (!module.main) {

        // Or it should be a module inside the current package
        if (module.n !== env.n) {
          // Otherwise, we will stop that.
          return;
        }
        module.a = true;
      }

      use_module(module, callback);
    }
  };

  // @param {string} path
  require.resolve = function (path) {
    return NEURON_CONF.resolve(parse_id(path, env).id);
  };

  return require;
}


// ## Script Loader
//////////////////////////////////////////////////////////////////////

var DOC = document;

// never use `document.body` which might be NULL during downloading of the document.
var HEAD = DOC.getElementsByTagName('head')[0];

function load_js (src) {
  var node = DOC.createElement('script');

  node.src = src;
  node.async = true;

  js_onload(node, function() {
    HEAD.removeChild(node);
  });

  // A very tricky way to avoid several problems in iOS webviews, including:
  // - webpage could not scroll down in iOS6
  // - could not maintain vertial offset when history goes back.
  setTimeout(function () {
    HEAD.insertBefore(node, HEAD.firstChild);
  }, 0);
}


var js_onload = DOC.createElement('script').readyState
  // @param {DOMElement} node
  // @param {!function()} callback asset.js makes sure callback is not NULL
  ? function (node, callback) {
    node.onreadystatechange = function() {
      var rs = node.readyState;
      if (rs === 'loaded' || rs === 'complete') {
        node.onreadystatechange = NULL;
        callback.call(this);
      }
    };
  }

  : function (node, callback) {
    node.addEventListener('load', callback, FALSE);
  };
  

// module define
// ---------------------------------------------------------------------------------------------------


// Method to define a module.

// **NOTICE** that `define` has no fault tolerance and type checking since neuron 2.0,
// because `define` method is no longer designed for human developers to use directly.
// `define` should be generated by some develop environment such as [cortex](http://github.com/cortexjs/cortex)
// @private

// @param {string} id (optional) module identifier
// @param {Array.<string>} dependencies ATTENSION! `dependencies` must be array of standard 
//   module id and there will be NO fault tolerance for argument `dependencies`. Be carefull!
// @param {function(...[*])} factory (require, exports, module)
// @param {Object=} options

// @return {undefined}
function define (id, dependencies, factory, options) {
  options || (options = {});

  var parsed = parse_id(id);
  if (parsed.p) {
    // Legacy
    // in old times, main entry: 
    // - define(id_without_ext)
    // - define(pkg) <- even older
    // now, main entry: define(id_with_ext)
    // parsed.p = legacy_transform_id(parsed.p, options);
    format_parsed(parsed);
  }
  
  var pkg = parsed.k;
  var modMain;
  if (options.main) {
    modMain = mods[pkg];
  }

  // `mod['a@1.1.0']` must be USED before `mod['a@1.1.0/index.js']`,
  // because nobody knows which module is the main entry of 'a@1.1.0'
  // But `mod['a@1.1.0/index.js']` might be DEFINED first.
  var mod = mods[parsed.id] = modMain || mods[parsed.id] || get_mod(parsed);
  if (options.main) {
    mods[pkg] = mod;
    // Set the real id and path
    mix(mod, parsed);
  }
  mix(mod, options);

  // A single module might be defined more than once.
  // use this trick to prevent module redefining, avoiding the subsequent side effect.
  // mod.factory        -> already defined
  // X mod.exports  -> the module initialization is done
  if (!mod.factory) {
    mod.factory = factory;
    mod.deps = dependencies;
    // ['a@0.0.1']  -> {'a' -> 'a@0.0.1'}
    generate_module_version_map(dependencies, mod.m);

    run_callbacks(mod, 'l');
  }
}


// @private
// create version info of the dependencies of current module into current sandbox
// @param {Array.<string>} modules no type detecting
// @param {Object} host

// ['a@~0.1.0', 'b@~2.3.9']
// -> 
// {
//     a: '~0.1.0',
//     b: '~2.3.9'
// }
function generate_module_version_map (modules, host) {
  modules.forEach(function(mod) {
    var name = mod.split('@')[0];
    host[name] = mod;
  });
}


// Run the callbacks
function run_callbacks (object, key) {
  var callbacks = object[key];
  var callback;
  // Mark the module is ready
  // `delete module.c` is not safe
  // #135
  // Android 2.2 might treat `null` as [object Global] and equal it to true,
  // So, never confuse `null` and `false`
  object[key] = FALSE;
  while(callback = callbacks.pop()){
    callback();
  }
}


// The logic to load the javascript file of a package
//////////////////////////////////////////////////////////////////////


function load_module (module, callback) {
  var mod = mods[module.id];
  mod.f = module.f;
  mod.a = module.a;
  var callbacks = mod.l;
  if (callbacks) {
    callbacks.push(callback);
    if (callbacks.length < 2) {
      load_by_module(mod);
    }
  }
}


// Scenarios:
// 1. facade('a/path');
// -> load a/path -> always
// 2. facade('a');
// -> load a.main
// 3. require('a');
// -> deps on a
// 4. require('./path')
// -> deps on a
// 5. require.async('a')
// -> load a.main -> 
// 6. require.async('./path')
// -> load a/path
// 7. require.async('b/path'): the entry of a foreign module
// -> forbidden

var pkgs = [];

// Load the script file of a module into the current document
// @param {string} id module identifier
function load_by_module (mod) {
  if (mod.d) {
    return;
  }

  // (D)ownloaded
  // flag to mark the status that a module has already been downloaded
  mod.d = true;

  var isFacade = mod.f;
  var isAsync = mod.a;
  var pkg = mod.k;

  // if one of the current package's entries has already been loaded,
  // and if the current module is not an entry(facade or async)
  if (~pkgs.indexOf(pkg)) {
    if (!isFacade && !isAsync) {
      return;
    }
  } else {
    pkgs.push(pkg);
  }

  var loaded = NEURON_CONF.loaded;
  // is facade ?
  var evidence = isFacade
    // if a facade is loaded, we will push `mod.id` of the facade instead of package id
    // into `loaded`
    ? mod.id
    : pkg;

  if (~loaded.indexOf(evidence)) {
    if (!isAsync) {
      // If the main entrance of the package is already loaded 
      // and the current module is not an async module, skip loading.
      // see: declaration of `require.async`
      return;
    }

    // load packages
  } else {
    loaded.push(evidence);
  }

  load_js(module_to_absolute_url(mod));
}


function module_to_absolute_url (mod) {
  var id = mod.main
    // if is a main module, we will load the source file by package
    // neuron-builder will always build the main entry file
    //   as a javascript file with the '.js' extension

    // 1.
    // on use: 'a@1.0.0' (async or sync)
    // -> 'a/1.0.0/a.js'

    // 2.
    // on use: 'a@1.0.0/relative' (sync)
    // -> not an async module, so the module is already packaged inside:
    // -> 'a/1.0.0/a.js'
    ? mod.k + '/' + mod.n + '.js'

    // if is an async module, we will load the source file by module id
    : mod.id;

  return NEURON_CONF.resolve(id);
}


// ## Graph Isomorphism and Dependency resolving
//////////////////////////////////////////////////////////////////////

// ### module.defined <==> module.factory
// Indicates that a module is defined, but its dependencies might not defined. 

// ### module.ready
// Indicates that a module is ready to be `require()`d which may occurs in two cases
// - A module is defined but has no dependencies
// - A module is defined, and its dependencies are defined, ready or loaded

// ### module.loaded
// Indicates that module.exports has already been generated

// Register the ready callback for a module, and recursively prepares
// @param {Object} module
// @param {function()} callback
// @param {Array=} stack
function ready (module, callback, stack) {
  emit('beforeready', module_id(module) + ':' + module.g);

  if (!module.factory) {
    emit('beforeload', module.id);
    return load_module(module, function () {
      emit('load', module_id(module));
      ready(module, callback, stack);
    });
  }

  var deps = module.deps;
  var counter = deps.length;

  var callbacks = module.r;
  // `module.r` is `[]` in origin.
  // `!callbacks` means the module is ready
  if (!counter || !callbacks) {
    module.r = FALSE;
    emit_ready(module);
    return callback();
  }

  callbacks.push(callback);
  // if already registered, skip checking
  if (callbacks.length > 1) {
    return;
  }

  var cb = function () {
    if (!-- counter) {
      stack.length = 0;
      stack = NULL;
      emit_ready(module);
      run_callbacks(module, 'r');
    }
  };

  stack = stack
    ? [module].concat(stack)
    : [module];

  deps.forEach(function (dep) {
    var child = get_module(dep, module);
    // If the child is already in the stack,
    // which means there might be cyclic dependency, skip it.
    if (~stack.indexOf(child)) {
      return cb();
    }
    ready(child, cb, stack);
  });
}


function emit_ready (module) {
  emit('ready', module_id(module) + ':' + module.g);
}


function module_id (module) {
  return module.main ? module.k : module.id;
}



// Manage configurations
//////////////////////////////////////////////////////////////////////

// var neuron_loaded = [];
var NEURON_CONF = {
  loaded: [],
  // If `config.graph` is not specified, 
  graph: {
    _: {}
  },
  resolve: module_id_to_absolute_url
};

// server: 'http://localhost/abc',
// -> http://localhost/abc/<relative>
// @param {string} relative relative module url
function module_id_to_absolute_url (id) {
  var pathname = id.replace('@', '/');
  var base = NEURON_CONF.path;
  base || err('config.path must be specified');
  return base + pathname;
}


var SETTERS = {

  // The server where loader will fetch modules from
  // Make sure the path is a standard pathname
  'path': function (path) {
    // Make sure 
    // - there's one and only one slash at the end
    // - `conf.path` is a directory 
    // Cases:
    // './abc' -> './abc/'
    // './abc/' -> './abc/'
    return path.replace(/\/*$/, '/');
  },

  'loaded': justReturn,
  'graph': justReturn,
  'resolve': justReturn
};


function justReturn (subject) {
  return subject;
}


function config (conf) {
  var key;
  var setter;
  for (key in conf) {
    setter = SETTERS[key];
    if (setter) {
      NEURON_CONF[key] = setter(conf[key]);
    }
  }
}


// ## Explose public methods
//////////////////////////////////////////////////////////////////////

// map of id -> defined module data
var mods = 
neuron._mods    = {};

neuron.config   = config;
neuron.error    = err;
neuron._conf    = NEURON_CONF;
neuron.on       = on;
neuron.loadJs   = load_js;

// private methods only for testing
// avoid using this method in product environment
// @expose
neuron._use     = function (id, callback) {
  use_module_by_id(id, callback);
};

// @expose
// Attach a module for business facade, for configurations of inline scripts
// if you want a certain biz module to be initialized automatically, the module's exports should contain a method named 'init'
// ### Usage 
// ```
// // require biz modules with configs
// facade('app-main-header-bar', {
//   icon: 'http://kael.me/u/2012-03/icon.png'
// });
//  ```
function facade (entry, data) {
  use_module_by_id(entry, function(method) {
    method.init && method.init(data);
  });
}


function use_module_by_id (id, callback) {
  var module = get_module(id);
  module.f = true;
  use_module(module, callback);
}


if (ENV.neuron) {
  return;
}

// @expose
ENV.neuron = neuron;

// @expose
ENV.define = define;

// @expose
ENV.facade = facade;



// Use `this`, and never cares about the environment.
})(this);