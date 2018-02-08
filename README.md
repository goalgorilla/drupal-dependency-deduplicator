Drupal Dependency Deduplicator
==============================

This is a tool that inspects all modules in a Drupal 8 project and provides 
a list of any dependencies that can be removed from an .info.yml file. It
considers a module to be a duplicate dependency if it is also a dependency
of one of the other modules that is listed as dependency in the same .info.yml
file.

As a side effect of the above analysis the program will exit with an error 
message whenever a cyclical dependency is found.

Installation
------------

### CLI Executable

This package is meant to be used as an executable so install it globally.

```
yarn global add drupal-dependency-deduplicator
```

#### Usage

```
Usage: ddd <directory>

Options:

  -V, --version  output the version number
  -h, --help     output usage information
```

Maintenance
-----------

Although the intention is to improve this softaare there is no guarantee
that bugs will be fixed at all or in a timely manner. You are welcome to
create issues and pull requests in the [GitHub repository](https://github.com/goalgorilla/drupal-dependency-deduplicator) if you'd like to
contribute.

Disclaimer
-----------

This package has been developed as an internal tool for GoalGorilla and 
published because it might be useful to others. The software is provided
as-is and might not function as advertised. GoalGorilla has no liability
for any errors as a result from usage of the software.
