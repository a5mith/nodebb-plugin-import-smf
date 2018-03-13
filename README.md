nodebb-plugin-import-smf
========================

a SMF 2.0 forum exporter to be required by [nodebb-plugin-import](https://github.com/akhoury/nodebb-plugin-import).

### What is this?

It's __just__ an exporter of [SMF 2.0](http://www.simplemachines.org/),  that provides an API that [nodebb-plugin-import](https://github.com/akhoury/nodebb-plugin-import)
can use to exporter source forum data and import it to NodeBB's database. So, it's not really a conventional nodebb-plugin.

### Why is it even a NodeBB plugin?

it doesn't really need to be, nor that you can use it within NodeBB it self, but, having this as a plugin have few benefits:
* a nodebb- namespace, since you can't really use it for anything else
* it can easily `require` NodeBB useful tools, currently

### Attachments note

Before you start import, make a copy of your attachments and place it in `./tmp/attachments/originals`, then run this command to strip everything after the `_` with it.
```
find $PWD -type f -name "*_*" -exec rename 's/(_.*)//' {} \;
```
So they would look something like this

![screen shot 2018-03-13 at 3 29 46 am](https://user-images.githubusercontent.com/1398375/37317658-d68e41c6-266e-11e8-8609-b7e6d9ed6c3b.png)

then when the export runs, it will copy the files to a sibling folder to `originals`, called `migrated`, so something like this.

![screen shot 2018-03-13 at 3 31 18 am](https://user-images.githubusercontent.com/1398375/37317688-053be4d8-266f-11e8-89be-a8aae5a90260.png)


Then when the import is done, copy the migrated folder and place it in `/path/to/nodebb/public/uploads/_imported_attachments/migrated` and copy your smf avatars files into `/path/to/nodebb/public/uploads/_imported_profiles/avatars`

### Usage within NodeJS only

```
// you don't have to do this, nodebb-plugin-import will require this plugin and use its api
// but if you want a run a test

var exporter = require('nodebb-plugin-import-smf');

exporter.testrun({
    dbhost: '127.0.0.1',
    dbport: 3306,
    dbname: 'smf',
    dbuser: 'user',
    dbpass: 'password',

    tablePrefix: 'smf_'
}, function(err, results) {

    /*
        results[0] > config
        results[1] > [groupsMap, groupsArray]
        results[2] > [usersMap, usersArray]
        results[3] > [messagesMap, messagesArray]
        results[4] > [categoriesMap, categoriesArray]
        results[5] > [topicsMap, topicsArray]
        results[6] > [postsMap, postsArray]
    */
});

```

### SMF Versions tested on:
  - SMF 2.0.3


