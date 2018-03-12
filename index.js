
var async = require('async');
var extend = require('extend');
var mysql = require('mysql');
var _ = require('underscore');
var noop = function(){};
var logPrefix = '[nodebb-plugin-import-smf]';

(function(Exporter) {

	Exporter.setup = function(config, callback) {
		Exporter.log('setup');

		// mysql db only config
		// extract them from the configs passed by the nodebb-plugin-import adapter
		var _config = {
			host: config.dbhost || config.host || 'localhost',
			user: config.dbuser || config.user || 'root',
			password: config.dbpass || config.pass || config.password || '',
			port: config.dbport || config.port || 3306,
			database: config.dbname || config.name || config.database || 'smf'
		};

		Exporter.log(_config);

		Exporter.config(_config);
		Exporter.config('prefix', config.prefix || config.tablePrefix || '');

		config.custom = config.custom || {};
		if (typeof config.custom === 'string') {
			try {
				config.custom = JSON.parse(config.custom)
			} catch (e) {}
		}

		config.custom = config.custom || {};
		config.custom.timemachine = config.custom.timemachine || {};
		config.custom = extend(true, {}, {
			/* TODO: ADD TIMEMACHINE SUPPORT */
		}, config.custom);

		Exporter.config('custom', config.custom);

		Exporter.connection = mysql.createConnection(_config);
		Exporter.connection.connect();

		setInterval(function() {
			Exporter.connection.query("SELECT 1", function(){});
		}, 60000);

		callback(null, Exporter.config());
	};

	Exporter.getGroups = function(callback) {
		return Exporter.getPaginatedGroups(0, -1, callback)
	};

	Exporter.getPaginatedGroups = function(start, limit, callback) {
		Exporter.log('getPaginatedGroups');
		callback = !_.isFunction(callback) ? noop : callback;

		var err;
		var prefix = Exporter.config('prefix');
		var query = 'SELECT '
			+ '\n' +  prefix + 'membergroups.id_group as _gid, '
			+ '\n' +  prefix + 'membergroups.group_name as _name, '
			+ '\n' +  prefix + 'membergroups.description as _description, '
			+ '\n' +  prefix + 'membergroups.hidden as _hidden '
			+ '\n' +  'FROM ' + prefix + 'membergroups '
			+ '\n' + (start >= 0 && limit >= 0 ? ' LIMIT ' + start + ',' + limit : '');


		if (!Exporter.connection) {
			err = {error: 'MySQL connection is not setup. Run setup(config) first'};
			Exporter.error(err.error);
			return callback(err);
		}

		Exporter.connection.query(query,
			function(err, rows) {
				if (err) {
					Exporter.error(err);
					return callback(err);
				}
				//normalize here
				var map = {};
				rows.forEach(function(row) {
					map[row._gid] = row;
				});
				callback(null, map);
			});
	};

	Exporter.getUsers = function(callback) {
		Exporter.getPaginatedUsers(0, -1, callback);
	};

	Exporter.getPaginatedUsers = function(start, limit, callback) {
		Exporter.log('getPaginatedUsers');
		callback = !_.isFunction(callback) ? noop : callback;

		var err;
		var prefix = Exporter.config('prefix');
		var query = 'SELECT '
			+ '\n' + prefix + 'members.id_member as _uid, '
			+ '\n' + prefix + 'members.member_name as _username, '
			+ '\n' + prefix + 'members.email_address as _email, '
			+ '\n' + prefix + 'members.real_name as _alternativeUsername, '
			+ '\n' + prefix + 'members.email_address as _registrationEmail, '
			+ '\n' + prefix + 'members.signature as _signature, '
			+ '\n' + '(' + prefix + 'members.last_login * 1000) as _lastonline, '
			+ '\n' + '(' + prefix + 'members.date_registered * 1000) as _joindate , '
			+ '\n' + prefix + 'members.location as _location, '
			+ '\n' + prefix + 'members.birthdate as _birthday, '
			+ '\n' + prefix + 'members.website_url as _website, '
			+ '\n CONCAT(' + prefix + 'members.id_group, \',\', ' + prefix + 'members.additional_groups) AS _groups, '
			+ '\n' + prefix + 'membergroups.group_name as _level, '
			+ '\n (' + prefix + 'ban_groups.cannot_access + ' + prefix + 'ban_groups.cannot_register + ' + prefix + 'ban_groups.cannot_post + ' + prefix + 'ban_groups.cannot_login) > 0 as _banned '
			+ '\n' + 'FROM ' + prefix + 'members '
			+ '\n' + 'LEFT JOIN ' + prefix + 'membergroups ON ' + prefix + 'membergroups.id_group = ' + prefix + 'members.id_group '
			+ '\n' + 'LEFT JOIN ' + prefix + 'ban_groups ON ' + prefix + 'ban_groups.name = ' + prefix + 'members.member_name '
			+ '\n' + 'WHERE ' + prefix + 'members.id_member = ' + prefix + 'members.id_member '
			+ '\n' + 'ORDER BY ' + prefix + 'members.id_member '
			+ '\n' + (start >= 0 && limit >= 0 ? ' LIMIT ' + start + ',' + limit : '');

		if (!Exporter.connection) {
			err = {error: 'MySQL connection is not setup. Run setup(config) first'};
			Exporter.error(err.error);
			return callback(err);
		}
		Exporter.connection.query(query,
			function(err, rows) {
				if (err) {
					Exporter.error(err);
					return callback(err);
				}

				//normalize here
				var map = {};
				rows.forEach(function(row) {
					if (/moderator/i.test(row._level)) {
						row._level = 'moderator';
					} else if (! /administrator/i.test(row._level)) {
						delete row._level;
					}
					row._groups = csvToArray(row._groups)
						.filter(function (_gid, i, arr) {
							return _gid && parseInt(_gid, 10) > 0 && arr.indexOf(_gid) === i;
						});
					map[row._uid] = row;
				});

				// keep a copy of the users in memory here
				Exporter._users = map;

				callback(null, map);
			});
	};

	Exporter.getCategories = function(callback) {
		return Exporter.getPaginatedCategories(0, -1, callback);
	};

	Exporter.getPaginatedCategories = function(start, limit, callback) {
		Exporter.log('getPaginatedCategories');
		callback = !_.isFunction(callback) ? noop : callback;

		var err;
		var prefix = Exporter.config('prefix');
		var query = 'SELECT '
			+ '\n' +  prefix + 'boards.id_board as _cid, '
			+ '\n' +  prefix + 'boards.id_parent as _parentCid, '
			+ '\n' +  prefix + 'boards.name as _name, '
			+ '\n' +  prefix + 'boards.description as _description, '
			+ '\n (' +  prefix + 'boards.lastUpdated * 1000) as _timestamp, '
			+ '\n' +  prefix + 'boards.board_order as _order '
			+ '\n' +  'FROM ' + prefix + 'boards '
			+ '\n' + (start >= 0 && limit >= 0 ? ' LIMIT ' + start + ',' + limit : '');


		if (!Exporter.connection) {
			err = {error: 'MySQL connection is not setup. Run setup(config) first'};
			Exporter.error(err.error);
			return callback(err);
		}

		Exporter.connection.query(query,
			function(err, rows) {
				if (err) {
					Exporter.error(err);
					return callback(err);
				}
				var map = {};
				rows.forEach(function(row) {
					row._description = row._description || 'No decsciption available';
					map[row._cid] = row;
				});

				callback(null, map);
			});
	};


	Exporter.getMessages = function(callback) {
		return Exporter.getPaginatedMessages(0, -1, callback);
	};

	Exporter.getPaginatedMessages = function(start, limit, callback) {
		Exporter.log('getPaginatedMessages');
		callback = !_.isFunction(callback) ? noop : callback;

		var err;
		var prefix = Exporter.config('prefix');
		var query = 'SELECT '
			+ '\n' +  prefix + 'personal_messages.id_pm as _mid, '
			+ '\n' +  prefix + 'personal_messages.id_member_from as _fromuid, '
			+ '\n' +  prefix + 'pm_recipients.id_member as _touid, '
			+ '\n' +  prefix + 'personal_messages.body as _content, '
			+ '\n (' +  prefix + 'personal_messages.msgtime * 1000) as _timestamp '
			+ '\n' +  'FROM ' + prefix + 'personal_messages '
			+ '\n' + 'JOIN ' + prefix + 'pm_recipients ON ' + prefix + 'pm_recipients.id_pm = ' + prefix + 'personal_messages.id_pm '
			+ '\n' + (start >= 0 && limit >= 0 ? ' LIMIT ' + start + ',' + limit : '');

		if (!Exporter.connection) {
			err = {error: 'MySQL connection is not setup. Run setup(config) first'};
			Exporter.error(err.error);
			return callback(err);
		}

		Exporter.connection.query(query,
			function(err, rows) {
				if (err) {
					Exporter.error(err);
					return callback(err);
				}
				var map = {};
				rows.forEach(function(row) {
					map[row._mid] = row;
				});

				callback(null, map);
			});
	};


	var getAttachmentsMap = function (callback) {
		callback = !_.isFunction(callback) ? noop : callback;
		var prefix = Exporter.config('prefix');

		if (Exporter['_attachmentsMap_']) {
			return callback(null, Exporter['_attachmentsMap_']);
		}
		var query = 'SELECT '
			+ prefix + 'attachments.id_attach as _aid, '
			+ prefix + 'attachments.id_msg as _pid, '
			+ prefix + 'attachments.id_member as _uid, '
			+ prefix + 'attachments.attachment_type as _type, '
			+ prefix + 'attachments.filename as _filename, '
			+ prefix + 'attachments.id_folder as _folderid, '
			+ prefix + 'attachments.downloads as _downloads, '
			+ prefix + 'attachments.width as _width, '
			+ prefix + 'attachments.height as _height '
			+ 'FROM ' + prefix + 'attachments ';

		Exporter.connection.query(query,
			function(err, rows) {
				if (err) {
					Exporter.error(err);
					return callback(err);
				}
				var map = {};
				rows.forEach(function(row) {
					map[row._pid] = map[row._pid] || [];
					map[row._pid].push({
						url: '/public/_imported_attachments_/' + row._folderid + '/' + row._filename,
						filename: row._filename,
						isImage: !!row._width
					});
				});
				Exporter['_attachmentsMap_'] = map;
				callback(null, map);
			});
	};

	Exporter.getTopics = function(callback) {
		return Exporter.getPaginatedTopics(0, -1, callback);
	};

	Exporter.getPaginatedTopics = function(start, limit, callback) {
		Exporter.log('getPaginatedTopics');
		callback = !_.isFunction(callback) ? noop : callback;

		var err;
		var prefix = Exporter.config('prefix');
		var query = 'SELECT '
			+ '\n' +  prefix + 'messages.id_topic as _tid, '
			+ '\n' +  prefix + 'messages.id_msg as _pid, '
			+ '\n' +  prefix + 'messages.id_board as _cid, '
			+ '\n' +  prefix + 'messages.id_member as _uid, '
			+ '\n' +  prefix + 'messages.subject as _title, '
			+ '\n' +  prefix + 'messages.body as _content, '
			+ '\n (' +  prefix + 'messages.poster_time * 1000) as _timestamp, '
			+ '\n (' +  prefix + 'messages.modified_time * 1000) as _edited, '
			+ '\n' +  prefix + 'topics.num_views as _viewcount, '
			+ '\n' +  prefix + 'messages.poster_ip as _ip, '
			+ '\n' +  prefix + 'messages.poster_email as _uemail, '
			+ '\n' +  prefix + 'messages.poster_name as _guest, '
			+ '\n' +  prefix + 'messages.approved as _approved, '
			+ '\n' +  prefix + 'topics.locked as _locked, '
			+ '\n' +  prefix + 'topics.is_sticky as _pinned '
			+ '\n' +  'FROM ' + prefix + 'topics '
			+ '\n' + 'JOIN ' + prefix + 'messages ON ' + prefix + 'messages.id_msg = ' + prefix + 'topics.id_first_msg '
			+ '\n' + (start >= 0 && limit >= 0 ? ' LIMIT ' + start + ',' + limit : '');


		if (!Exporter.connection) {
			err = {error: 'MySQL connection is not setup. Run setup(config) first'};
			Exporter.error(err.error);
			return callback(err);
		}

		getAttachmentsMap(function (err, attachmentsMap) {
			if (err) {
				Exporter.error(err);
				return callback(err);
			}
			Exporter.connection.query(query,
				function(err, rows) {
					var map = {};
					if (err) {
						Exporter.error(err);
						return callback(err);
					}
					rows.forEach(function(row) {
						var attachments = attachmentsMap[row._pid] || [];
						row._images = attachments.filter(function (attachment) {
							return attachment.isImage;
						});
						row._attachments = attachments.filter(function (attachment) {
							return !attachment.isImage;
						});
						map[row._tid] = row;
					});
					callback(null, map);
				});
		});
	};

	Exporter.getPosts = function(callback) {
		return Exporter.getPaginatedPosts(0, -1, callback)
	};

	Exporter.getPaginatedPosts = function(start, limit, callback) {
		Exporter.log('getPaginatedPosts');
		callback = !_.isFunction(callback) ? noop : callback;

		var err;
		var prefix = Exporter.config('prefix');
		var query = 'SELECT '
			+ prefix + 'messages.id_msg as _pid, '
			+ '\n' +  prefix + 'messages.id_topic as _tid, '
			+ '\n' +  prefix + 'messages.id_member as _uid, '
			+ '\n' +  prefix + 'messages.body as _content, '
			+ '\n (' +  prefix + 'messages.poster_time * 1000) as _timestamp, '
			+ '\n (' +  prefix + 'messages.modified_time * 1000) as _edited, '
			+ '\n' +  prefix + 'messages.poster_ip as _ip, '
			+ '\n' +  prefix + 'messages.poster_name as _guest, '
			+ '\n' +  prefix + 'messages.approved as _approved '
			+ '\n FROM ' + prefix + 'messages '
			+ '\n WHERE ' + prefix + 'messages.id_topic > 0 AND ' + prefix + 'messages.id_msg NOT IN (SELECT id_first_msg FROM ' + prefix + 'topics) '
			+ '\n' + (start >= 0 && limit >= 0 ? ' LIMIT ' + start + ',' + limit : '');

		if (!Exporter.connection) {
			err = {error: 'MySQL connection is not setup. Run setup(config) first'};
			Exporter.error(err.error);
			return callback(err);
		}

		getAttachmentsMap(function (err, attachmentsMap) {
			if (err) {
				Exporter.error(err);
				return callback(err);
			}
			Exporter.connection.query(query,
				function(err, rows) {
					var map = {};
					if (err) {
						Exporter.error(err);
						return callback(err);
					}
					rows.forEach(function(row) {

						var attachments = attachmentsMap[row._pid] || [];
						row._images = attachments.filter(function (attachment) {
							return attachment.isImage;
						});
						row._attachments = attachments.filter(function (attachment) {
							return !attachment.isImage;
						});
						map[row._pid] = row;
					});
					callback(null, map);
				});
		});
	};

	Exporter.teardown = function(callback) {
		Exporter.log('teardown');
		Exporter.connection.end();

		Exporter.log('Done');
		callback();
	};

	Exporter.testrun = function(config, callback) {
		async.series([
			function(next) {
				Exporter.setup(config, next);
			},
			function(next) {
				Exporter.getGroups(next);
			},
			function(next) {
				Exporter.getUsers(next);
			},
			function(next) {
				Exporter.getMessages(next);
			},
			function(next) {
				Exporter.getCategories(next);
			},
			function(next) {
				Exporter.getTopics(next);
			},
			function(next) {
				Exporter.getPosts(next);
			},
			function(next) {
				Exporter.teardown(next);
			}
		], callback);
	};

	Exporter.paginatedTestrun = function(config, callback) {
		async.series([
			function(next) {
				Exporter.setup(config, next);
			},
			function(next) {
				Exporter.getPaginatedGroups(0, 1000, next);
			},
			function(next) {
				Exporter.getPaginatedUsers(0, 1000, next);
			},
			function(next) {
				Exporter.getPaginatedMessages(0, 1000, next);
			},
			function(next) {
				Exporter.getPaginatedCategories(0, 1000, next);
			},
			function(next) {
				Exporter.getPaginatedTopics(0, 1000, next);
			},
			function(next) {
				Exporter.getPaginatedPosts(1001, 2000, next);
			},
			function(next) {
				Exporter.teardown(next);
			}
		], callback);
	};

	Exporter.warn = function() {
		var args = _.toArray(arguments);
		args.unshift(logPrefix);
		console.warn.apply(console, args);
	};

	Exporter.log = function() {
		var args = _.toArray(arguments);
		args.unshift(logPrefix);
		console.log.apply(console, args);
	};

	Exporter.error = function() {
		var args = _.toArray(arguments);
		args.unshift(logPrefix);
		console.error.apply(console, args);
	};

	Exporter.config = function(config, val) {
		if (config != null) {
			if (typeof config === 'object') {
				Exporter._config = config;
			} else if (typeof config === 'string') {
				if (val != null) {
					Exporter._config = Exporter._config || {};
					Exporter._config[config] = val;
				}
				return Exporter._config[config];
			}
		}
		return Exporter._config;
	};

	var csvToArray = function(v) {
		return !Array.isArray(v) ? ('' + v).split(',').map(function(s) { return s.trim(); }) : v;
	};

	// from Angular https://github.com/angular/angular.js/blob/master/src/ng/directive/input.js#L11
	Exporter.validateUrl = function(url) {
		var pattern = /^(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/;
		return url && url.length < 2083 && url.match(pattern) ? url : '';
	};

	Exporter.truncateStr = function(str, len) {
		if (typeof str != 'string') return str;
		len = _.isNumber(len) && len > 3 ? len : 20;
		return str.length <= len ? str : str.substr(0, len - 3) + '...';
	};

	Exporter.whichIsFalsy = function(arr) {
		for (var i = 0; i < arr.length; i++) {
			if (!arr[i])
				return i;
		}
		return null;
	};

})(module.exports);
