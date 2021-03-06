require('dotenv').config(); // process.env to store API keys/tokens
const command = require('./command');

const CronJob = require('cron').CronJob;

const Discord = require('discord.js');
const client = new Discord.Client();

const firebase = require('firebase');
firebase.initializeApp({
	apiKey: process.env.firebase_key,
	databaseURL: process.env.firebase_url,
	projectId: process.env.firebase_project_id,
});
const database = firebase.database();

const SpotifyWebApi = require('spotify-web-api-node');
const spotifyApi = new SpotifyWebApi({
	clientId: process.env.spotify_client_id,
	clientSecret: process.env.spotify_client_secret,
});

const channelID = process.env.channel_ID;
const prefix = process.env.prefix;
let artistDict = {};
let dictSize;

client.on('ready', async () => {
	console.log('Discord Client Ready');
	await fillArtistDict();
	await refreshAccessToken();
	const statusInterval = setInterval(setStatus, 3600000);
	let checkMusicAtMidnightJob = new CronJob(
		'1 */12 * * *',
		() => {
			// cron job everyday at 12:01 AM and 12:01 PM
			console.log('Running cron job');
			client.channels.cache.get(channelID).send(`${prefix}check`);
		},
		undefined,
		true,
		'America/New_York'
	);
	checkMusicAtMidnightJob.start();

	command(client, 'add', (message) => {
		let artistName = message.content.replace(`${prefix}add `, '');
		if (message.content === `${prefix}add` || !artistName) {
			message.channel.send(
				`Enter a valid artist name. i.e. \'${prefix}add Drake\'`
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
								`Enter a valid artist name.\ni.e. \'${prefix}add Drake\'`
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
		let artistName = message.content.replace(`${prefix}rm `, '');
		if (message.content === `${prefix}add` || !artistName) {
			message.channel.send(
				`Enter a valid artist name.\ni.e. \'${prefix}remove Drake\'`
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
									`Artist does not exist in your list of artists.\nTry \'${prefix}ls\' to list your added artists.`
								);
							}
						} else {
							message.channel.send(
								`Enter a valid artist name.\ni.e. \'${prefix}rm Drake\'`
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
					name: `${prefix}add`,
					value: 'Add artist to your list of artists.',
				},
				{
					name: `${prefix}remove (rm)`,
					value: 'Remove artist to your list of artists.',
				},
				{
					name: `${prefix}list (ls)`,
					value: 'List all artists in your list of artists.',
				},
				{
					name: `${prefix}check`,
					value: 'Check for new music from your list of artists.',
				},
			],
		};
		message.channel.send({
			embed,
		});
	});
});

client.login(process.env.discord_token);

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
		client.user.setActivity(`${prefix}help`, {
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
let interval = setInterval(refreshAccessToken, 3600000);
