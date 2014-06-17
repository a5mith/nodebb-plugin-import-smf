var argv = require('optimist').argv,
	fs = require('fs-extra'),
	path = require('path'),

	usage = function(notice) {
		if (notice) console.log('\n' + notice);

		console.log(+''
			+ '\nUsage: node bin/export.js --storage="path/to/storage" --config="path/to/export.config.json" --log="debug" --flush '
			+ '\n\nthis tool will export your SMF Threads Forum data, into structured files that nodebb-plugin-import can  consume and import to NodeBB'
			+ '\n-c | --config	: [REQUIRED] input config file'
			+ '\n-s | --storage	: [OPTIONAL] defaults to \'./\', this is where your want to store the output files, this flag will override the export.config.json value'
			+ '\n-l | --log	: [OPTIONAL] log level, WILL override whatever is in the export.config.json file, if none, defaults to "debug", i think'
			+ '\n-f | --flush : [OPTIONAL] if you want to flush storage dir and start over, WILL override its value in export.config.json'
		);
	},

	error = function (msg) {
		usage();
		throw new Error(msg);
	};

var configFile = argv.c || argv.config || '';
if (!configFile) error ('You must provide a config file');
configFile = path.resolve(configFile);
if (!fs.existsSync(configFile)) error(configFile + ' does not exist or cannot be read.');
var config = fs.readJsonSync(configFile);

config.storageDir = argv.s || argv.storage || config.storageDir;

if (config.storageDir) {
	config.log = argv.l || argv.log || config.log;
	config.clearStorage = argv.f || argv.flush ? true : config.clearStorage;

	var Export = require('../lib/export.js');

	new Export(config).start();

} else {
	error ('You must provide a storage dir, either in the config file or using the --storage flag');
}