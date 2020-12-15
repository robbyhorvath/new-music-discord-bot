const config = require('./config.json'); // config file to store API keys
const command = require('./command');

const Discord = require('discord.js');
const client = new Discord.Client();

const firebase = require('firebase');
firebase.initializeApp({
	apiKey: config.firebase_key,
	databaseURL: config.firebase_url,
	projectId: config.firebase_project_id,
});
const database = firebase.database();

const SpotifyWebApi = require('spotify-web-api-node');
const spotifyApi = new SpotifyWebApi({
	clientId: config.spotify_client_id,
	clientSecret: config.spotify_client_secret,
});

let artistDict = {};
let dictSize;

client.on('ready', async () => {
	console.log('Discord Client Ready');
	await fillArtistDict();
	await refreshAccessToken();
	setStatus();

	command(client, 'add', (message) => {
		let artistName = message.content.replace(`${config.prefix}add `, '');
		if (message.content === `${config.prefix}add` || !artistName) {
			message.channel.send(
				`Enter a valid artist name. i.e. \'${config.prefix}add Drake\'`
			);
		} else {
			spotifyApi
				.searchArtists(artistName, {
					limit: 1,
				})
				.then(
					(data) => {
						let artistData = data.body.artists.items[0];
						if (artistData) {
							message.channel.send(`Adding:  ${artistData.name}`);
							addNewArtist(
								artistData.name
									.replace('$', 'S')
									.replace(',', ''),
								artistData.uri.replace('spotify:artist:', '')
							);
							fillArtistDict();
						} else {
							message.channel.send(
								`Enter a valid artist name.\ni.e. \'${config.prefix}add Drake\'`
							);
						}
					},
					(err) => {
						console.error(err);
					}
				);
		}
	});

	command(client, 'rm', (message) => {
		let artistName = message.content.replace(`${config.prefix}rm `, '');
		if (message.content === `${config.prefix}add` || !artistName) {
			message.channel.send(
				`Enter a valid artist name.\ni.e. \'${config.prefix}remove Drake\'`
			);
		} else {
			spotifyApi
				.searchArtists(artistName, {
					limit: 1,
				})
				.then(
					(data) => {
						let artistData = data.body.artists.items[0];
						if (artistData) {
							let artistName = artistData.name;
							if (
								artistName &&
								artistDict.hasOwnProperty(artistName)
							) {
								artistName.replace('$', 'S').replace(',', '');
								message.channel.send(
									`Removing:  ${artistName}`
								);
								removeArtist(artistName);
								fillArtistDict();
							} else {
								message.channel.send(
									`Artist does not exist in your list of artists.\nTry \'${config.prefix}ls\' to list your added artists.`
								);
							}
						} else {
							message.channel.send(
								`Enter a valid artist name.\ni.e. \'${config.prefix}rm Drake\'`
							);
						}
					},
					(err) => {
						console.error(err);
					}
				);
		}
	});

	command(client, 'check', (message) => {
		let newMusicRole = message.guild.roles.cache.find(
			(role) => role.name === 'New Music'
		);
		getNewMusic(newMusicRole).then(
			(embed) => {
				if (embed.fields[0])
					message.channel.send({
						embed,
					});
				else {
					let embed = {
						title: 'No Music Today :(',
						color: '1DB954',
						fields: [],
					};
					message.channel.send({
						embed,
					});
				}
			},
			(err) => {
				console.error(err);
			}
		);
	});

	command(client, ['ls', 'list'], (message) => {
		let embed = {
			title: '**__Artists__**',
			color: '1DB954',
			fields: [],
		};
		let str = '';
		for (const [name, uri] of Object.entries(artistDict)) {
			str += `${name}\n`;
		}
		embed.description = str;
		message.channel.send({
			embed,
		});
	});

	command(client, ['h', 'help'], (message) => {
		let embed = {
			title: '**__Commands__**',
			color: '1DB954',
			fields: [
				{
					name: `${config.prefix}add`,
					value: 'Add artist to your list of artists.',
				},
				{
					name: `${config.prefix}remove (rm)`,
					value: 'Remove artist to your list of artists.',
				},
				{
					name: `${config.prefix}list (ls)`,
					value: 'List all artists in your list of artists.',
				},
				{
					name: `${config.prefix}check`,
					value: 'Check for new music from your list of artists.',
				},
			],
		};
		message.channel.send({
			embed,
		});
	});

	command(client, ['cc', 'clearchannel'], (message) => {
		if (message.member.hasPermission('ADMINISTRATOR')) {
			message.channel.messages.fetch().then((results) => {
				message.channel.bulkDelete(results);
			});
		}
	});
});

client.login(config.discord_token);

async function addNewArtist(name, uri) {
	await database.ref('artists/').child(name).set(uri);
}

async function removeArtist(name) {
	await database
		.ref(`artists/${name}`)
		.remove()
		.then((err) => {
			if (err) {
				console.error(err);
			} else {
				delete artistDict[name];
				console.log('Successfully removed artist.');
			}
		});
}

async function getNewMusic(roleID) {
	const date = getFormattedDate();
	let embed = {
		title: '**__New Music Today__**',
		description: `${roleID}`,
		color: '1DB954',
		fields: [],
	};
	for (const [name, uri] of Object.entries(artistDict)) {
		let newMusicStr = '';
		await spotifyApi
			.getArtistAlbums(uri, {
				album_type: 'album',
				limit: 1,
			})
			.then(
				(data) => {
					let album = data.body.items[0];
					if (album && album.release_date === date) {
						newMusicStr += `New Album:\n${album.name}\n[Link](${album.external_urls.spotify})\n\v`;
					}
				},
				(err) => {
					console.error(err);
				}
			);
		await spotifyApi
			.getArtistAlbums(uri, {
				album_type: 'single',
				limit: 1,
			})
			.then(
				(data) => {
					let single = data.body.items[0];
					if (single && single.release_date === date) {
						newMusicStr += `New Single:\n${single.name}\n[Link](${single.external_urls.spotify})\n\v`;
					}
				},
				(err) => {
					console.error(err);
				}
			);
		if (newMusicStr)
			embed.fields.push({
				name: name,
				value: newMusicStr,
			});
	}
	return embed;
}

function getFormattedDate() {
	let formattedDate = '';
	let date = new Date().toLocaleDateString('en-US', {
		timeZone: 'America/New_York',
	});
	let firstIndex = date.indexOf('/');
	let lastIndex = date.lastIndexOf('/');
	let month = date.slice(0, firstIndex);
	let day = date.slice(firstIndex + 1, lastIndex);
	let year = date.slice(lastIndex + 1, date.length);
	formattedDate += `${year}-`;
	if (month < 10) formattedDate += `0${month}-`;
	else formattedDate += `${month}-`;
	if (day < 10) formattedDate += `0${day}`;
	else formattedDate += `${day}`;
	return formattedDate;
	// return '2020-12-11'; // Test date. Man on the Moon III came out.
}

function getRandomArtist() {
	let artist = null;
	let randomIndex = Math.floor(Math.random() * dictSize);
	let count = 0;
	for (const [name, uri] of Object.entries(artistDict)) {
		if (count === randomIndex) {
			artist = name;
			break;
		}
		count++;
	}

	return artist;
}

async function fillArtistDict() {
	artistDict = {};
	await database.ref('artists/').once(
		'value',
		(snapshot) => {
			let counter = 0;
			dictSize = snapshot.numChildren();
			snapshot.forEach((childSnapshot) => {
				artistDict[
					Object.keys(snapshot.val())[counter]
				] = childSnapshot.val();
				counter++;
			});
		},
		(err) => {
			console.error(err);
		}
	);
}

function setStatus() {
	artist = getRandomArtist();
	if (artist)
		client.user.setActivity(`${artist}`, {
			type: 'LISTENING',
		});
	else
		client.user.setActivity(`${config.prefix}help`, {
			type: 'LISTENING',
		});
}

async function refreshAccessToken() {
	await spotifyApi.clientCredentialsGrant().then(
		(data) => {
			spotifyApi.setAccessToken(data.body['access_token']);
		},
		(err) => {
			console.error(
				'Something went wrong when retrieving an access token',
				err
			);
		}
	);
}
