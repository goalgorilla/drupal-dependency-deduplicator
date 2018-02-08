const Promise = require('bluebird');
var DepGraph = require('dependency-graph').DepGraph;

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const program = require('commander');

const config = require('./package.json');

program
  .version(config.version)
  .description('Parses all .info.yml files in a directory and builds a dependency graph')
  .usage('<directory>')
  .parse(process.argv);

if (!program.args.length) {
  console.error('Missing arguments, try `' + program.name() + ' --help`');
  process.exit(1);
}

const baseDir = program.args[0];

/**
 * Recursively searches a directory for files matching a filter.
 *
 * Returns an array of all the files that match the filter in the directory
 * or any of its children.
 *
 * @param startPath
 *   The path to start searching at.
 * @param filter
 *   The filter to apply.
 *
 * @return string[]
 *   A list of files that match the filter.
 */
function fromDir(startPath, filter){

  let found = [];

  // Check if the path exists
  if (!fs.existsSync(startPath)) {
    console.error('No such directory: ',startPath);
    process.exit(1);
  }

  const files=fs.readdirSync(startPath);
  for (let i=0;i<files.length;i++) {
    const filename=path.join(startPath,files[i]);
    const stat = fs.lstatSync(filename);

    if (stat.isDirectory()){
      found.push(... fromDir(filename, filter));
    }
    else if (filename.indexOf(filter)>=0) {
      found.push(filename);
    }
  }

  return found;
}

const modules = fromDir(baseDir, '.info.yml');

console.log('Found', modules.length, 'modules');

let loads = [];

for (let file of modules) {
  const p = new Promise(function (resolve, reject) {
    const filename = file;
    fs.readFile(filename, (err, data) => {
      if (err) return reject(err);
      resolve([filename, data]);
    });
  });
  loads.push(p);
}

// Expect to end up with circular dependencies.
let graph = new DepGraph();

Promise.map(loads, (item) => {
  const [filename, buffer] = item;
  const data = buffer.toString();

  return [filename, yaml.safeLoad(data, {filename: filename})];
}).map((item) => {
  const [filepath, yml] = item;

  yml.path = filepath;

  // Turn the project:module syntax into just module.
  if (yml.dependencies) {
    for (let i in yml.dependencies) {
      // Split on the : in the name.
      const split = yml.dependencies[i].split(':');

      // Take the last element of the array (works with and without :).
      // Then remove any possible version constraints.
      yml.dependencies[i] = split[split.length - 1].split(' ')[0];
    }
  }

  const modulename = path.basename(filepath).replace('.info.yml', '');

  return [modulename, yml];
}).reduce((modules, module) => {
  const [name, yml] = module;

  modules[name] = yml;

  // Add this module as a node to our graph.
  graph.addNode(name);

  return modules;
}, {}).then((modules) => {
  // We already added all modules to the graph, now add all dependencies.
  for (let name in modules) {
    const dependencies = modules[name].dependencies;
    if (dependencies && dependencies.length) {
      for (let dep of dependencies) {
        try {
          graph.addDependency(name, dep);
        }
        catch (e) {
          // Some modules declare dependencies that may not be installed.
          // Ignore those but propagate other errors.
          if (e.message.indexOf('Node does not exist') === -1) {
            console.log('Error for', name, dep);
            throw e;
          }
        }
      }
    }
  }

  try {
    // Fetch the overall order to trigger any cyclical dependencies.
    graph.overallOrder();
  }
  catch (e) {
    // Handle the cyclical dependency error.
    if (e.message.indexOf('Dependency Cycle Found: ') !== -1) {
      console.log('Found the following cyclical dependency:', e.message.split(': ')[1]);
      process.exit();
    }
    throw e;
  }

  for (let module in modules) {
    let dependencies = modules[module].dependencies;

    // Skip modules without dependencies.
    if (!dependencies || !dependencies.length) {
      continue;
    }

    let duplicates = [];

    for (let dependency of dependencies) {
      // Only check other dependencies, not this one.
      let otherDeps = dependencies;
      delete otherDeps[otherDeps.indexOf(dependency)];

      try {
        let duplicateOwner = findDependencyDuplicate(dependency, otherDeps);

        if (duplicateOwner) {
          duplicates.push([duplicateOwner, dependency]);
        }
      }
      catch (e) {
        // Skip faux dependencies from tests
        if (e.message.indexOf('Node does not exist') !== -1) {
          break;
        }
      }

    }

    if (duplicates.length) {
      console.log('Found duplicate dependencies for', module);
      console.log('duplicate'.padding(30), 'owner');
      console.log(''.padding(54, '-'));
      for (let relation of duplicates) {
        const [owner, duplicate] = relation;
        console.log(duplicate.padding(30), owner);
      }
      console.log(''.padding(54, '-'));
      console.log('');
    }
  }

});


function findDependencyDuplicate(dependency, dependencies, checked, parent) {
  // Keep track of which dependency's children have been checked.
  if (typeof checked === 'undefined') {
    checked = [dependency];
  }

  // Start out with ourselves as the parent.
  if (typeof parent === 'undefined') {
    parent = dependency;
  }

  // For each dependency check if it is a duplicate of what we're looking for.
  for (let checkDependency of dependencies) {
    // Sometimes undefined items slip in the array
    if (typeof checkDependency === 'undefined') {
      continue;
    }

    // If we find a duplicate return the name of our dependency that has it.
    if (checkDependency === dependency) {
      return parent;
    }

    // Skip dependencies for which we already checked children.
    if (checked.indexOf(checkDependency) === -1) {
      checked.push(checkDependency);
      // Otherwise check if the dependency is in one of our child dependencies.
      let children = graph.dependenciesOf(checkDependency);

      if (children) {
        let owner = findDependencyDuplicate(dependency, children, checked, checkDependency);
        if (owner) {
          return owner;
        }
      }
    }
  }

  // If we reach this we went down the rabbit hole without duplicates.
  return false;
}

/**
 * object.padding(number, string)
 * Transform the string object to string of the actual width filling by the padding character (by default ' ')
 * Negative value of width means left padding, and positive value means right one
 *
 * @param       number  Width of string
 * @param       string  Padding chacracter (by default, ' ')
 * @return      string
 * @access      public
 */
String.prototype.padding = function(n, c)
{
  var val = this.valueOf();
  if ( Math.abs(n) <= val.length ) {
    return val;
  }
  var m = Math.max((Math.abs(n) - this.length) || 0, 0);
  var pad = Array(m + 1).join(String(c || ' ').charAt(0));
  //      var pad = String(c || ' ').charAt(0).repeat(Math.abs(n) - this.length);
  return (n < 0) ? pad + val : val + pad;
//      return (n < 0) ? val + pad : pad + val;
};
