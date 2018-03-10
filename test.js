var fs = require('fs-extra');

require('./index').testrun({
    dbhost: '127.0.0.1',
    dbport: 3306,
    dbname: 'smf',
    dbuser: 'root',
    dbpass: 'password',
    tablePrefix: 'smf_'
}, function(err, results) {
    fs.writeFileSync('./tmp.json', JSON.stringify(results, undefined, 2));
    process.exit(err ? 1 : 0);
});