const https = require('https');
const sleep = require('await-sleep');
const moment = require('moment');
const utils = require('../../utils');

const call_limit = 100; // Limit of items to retrieve
const retry_limit = 8; // Limit number of retry
const retry_timeout = 1800; // Limit number of retry

/**
 * httpsCall Call the API end parse de response
 * @params options
 */
const httpsCall = async function(options) {
  return new Promise((resolve, reject) => {
    var req = https.get(options, response => {
      // Event when receiving the data
      var responseBody = "";
      response.on('data', function(chunck) { responseBody += chunck });

      // Event when the request is ending
      response.on('end', () => {
        try {
          let json = JSON.parse(responseBody)
          if (response.statusCode === 200) {
            if (!json) { // json is undefined or null
              reject(utils.error("Unvalid json", 500));
            } else if (json.error) { // json has an error (set by Deezer)
              reject(utils.error(json.error.message, json.error.code));
            } else { // otherwise, json is ok
              resolve(json)
            }
          } else {
            if(json.error) {
              reject(utils.error(json.error.message, response.statusCode));
            } else {
              reject(utils.error("Something went wrong...", 500));
            }
          }
        } catch(e) {
          reject(utils.error(e.message, 500));
        }
      })
    }).on('error', function(e) {
      reject(utils.error(e.message, 500));
    });
  })
}

async function getMeAccount(access_token) {
  var me;
  var callError;
  var retry = retry_limit;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.spotify.com',
        path: '/v1/me',
        method: 'GET',
        headers: {
          'Authorization': 'Bearer '+access_token,
          'content-type': 'text/json'
        },
      };

    const call = await httpsCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
      });

    if(call) {
      me = call;
    } else {
      await sleep(retry_timeout);
    }
  } while (!me && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (!me) {
      if (callError) {
        reject (callError)
      } else {
        reject(utils.error("No content"), 200);
      }
    } else {
      resolve(formatUserToStandard(me))
    }
  })
}

async function fetchSearch(access_token, type, query, strict) {
  var search;
  var callError;
  var retry = retry_limit;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.spotify.com',
        // artist?q=eminem
        path: '/v1/search?type='+type+'&q='+encodeURI(query),
        method: 'GET',
        headers: {
          'Authorization': 'Bearer '+access_token,
          'Content-Type': 'text/json'
        },
      };

    const call = await httpsCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
      });

    if(call) {
      search = call;
    } else {
      await sleep(retry_timeout);
    }
  } while (!search && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (!search) {
      if (callError) {
        reject(callError);
      } else {
        reject(utils.error("No content", 200));
      }
    } else {
      resolve(search)
    }
  })
}

async function getSearch(access_token, query, types = "*", strict = true) {
  const allowedTypes = ['artist', 'album', 'playlist', 'track'];
  var search_types = [];
  var results = new Object, countResults = 0;
  var callError;

  if (types == "*") {
    search_types = allowedTypes;
  } else {
    if (types.includes(",")) {
      search_types = allowedTypes.filter(i => types.split(",").includes(i));
    } else {
      search_types = allowedTypes.filter(item => item == types);
    }
  }

  if (search_types.length > 0) {
    await utils.asyncForEach(search_types, async (type) => {
      await fetchSearch(access_token, type, query, strict)
        .then((result) => {
          switch(type) {
            case 'artist':
              //results.artist = result.artists.items;
              results.artist = result.artists.items.map(i => formatArtistToStandard(i));
              countResults += results.artist.length || 0;

              break;
            case 'album':
              //results.album = result.albums.items;
              results.album = result.albums.items.map(i => formatAlbumToStandard(i));
              countResults += results.album.length || 0;
              break;
            case 'playlist':
              //results.playlist = result.playlists.items;
              results.playlist = result.playlists.items.map(i => formatPlaylistToStandard(i));
              countResults += results.playlist.length || 0;
              break;
            case 'track':
              //results.track = result.tracks.items;
              results.track = result.tracks.items.map(i => formatTrackToStandard(i));
              countResults += results.track.length || 0;
              break;
          }
        })
        .catch(err => callError = err)
    })
    results.total = countResults;

    if (strict) {
      countResults = 0;
      await utils.asyncForEach(search_types, async (type) => {
        switch(type) {
          case 'artist':
            if (results.artist) {
              results.artist = results.artist.filter(item => item.name.toUpperCase() == query.toUpperCase())
              countResults += results.artist.length;
            }
            break;
          case 'album':
            if (results.album) {
              await Promise
                .all(results.album.map(a => fetchAlbum(a.id).catch(err => callError = err)))
                .then(albums => {
                  results.album = albums.map(i => formatAlbumToStandard(i))
                  countResults += results.album.length;
                }).catch(err => callError = err);
            }
            break;
          case 'track':
            if (results.track) {
              await Promise
                .all(results.track.map(t => fetchTrack(t.id).catch(err => callError = err)))
                .then(tracks => {
                  results.track = tracks.map(i => formatTrackToStandard(i))
                  countResults += results.tracks.length;
                }).catch(err => callError = err);
            }
            break;
          case 'user':
            if (results.user) {
              results.user = results.user.filter(item => item.name.toUpperCase() == query.toUpperCase())
              countResults += results.user.length;
            }
            break;
        }
      })
      results.total = 0;
    }
  } else {
    callError = utils.error("Bad t paramater", 400)
  }

  return new Promise((resolve, reject) => {
    if (countResults == 0) {
      if (callError) {
        reject(callError)
      } else {
        reject(utils.error("No content", 200))
      }
    } else {
      resolve(results)
    }
  })
}

////////////////////////
// FORMAT TO STANDARD //
////////////////////////
function formatArtistToStandard(artist) {
  return {
    _obj: 'artist',
    _uid: 'spotify-'+artist.type+'-'+artist.id,
    // Related to the author
    id: artist.id,
    name: artist.name,
    picture: artist.images && artist.images.length > 0 ? artist.images[0].url : null,
    link: artist.external_urls.spotify ? artist.external_urls.spotify : "https://open.spotify.com/artist/"+artist.id,
    albums: /*artist.albums ? artist.albums.data.map(a => formatAlbumToStandard(a)) :*/ null,
    nb_albums: /*artist.nb_album ? artist.nb_album :*/ null,
    nb_fans: artist.followers ? artist.followers.total : null,
    added_at: /*artist.time_add ? timestampToDate(artist.time_add) :*/ null,
  };
}

function formatAlbumToStandard(album){
  return {
    _obj: 'album',
    _uid: 'spotify-'+album.album_type+'-'+album.id,
    // Related to the author
    id: album.id,
    name: album.title,
    type: album.album_type,
    picture: album.images && album.images.length > 0 ? album.images[0].url : null,
    link: album.external_urls.spotify ? album.external_urls.spotify : "https://open.spotify.com/album/"+album.id,
    upc: album.upc || null,
    artists: artists.push(album.artists.map(i => formatArtistToStandard(i))),
    updated_at: album.release_date,
    added_at: /*album.time_add ? timestampToDate(album.time_add) :*/ null,
  };
}

function formatPlaylistToStandard(playlist){
  return {
    _obj: 'playlist',
    _uid: 'spotify-'+playlist.type+'-'+playlist.id,
    // Related to the author
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    picture: playlist.images && playlist.images.length > 0 ? playlist.images[0].url : null,
    link: playlist.external_urls.spotify ? playlist.external_urls.spotify : "https://open.spotify.com/playlist/"+playlist.id,
    updated_at: /*playlist.time_mod ? timestampToDate(playlist.time_mod) :*/ null,
    added_at: /*playlist.time_add ? timestampToDate(playlist.time_add) :*/ null,
  };
}

function formatTrackToStandard(track){
  return {
    _obj: 'track',
    _uid: 'spotify-'+track.type+'-'+track.id,
    // Related to the author
    id: track.id,
    name: track.name,
    link: track.external_urls.spotify ? track.external_urls.spotify : "https://open.spotify.com/track/"+track.id,
    isrc: track.external_ids.isrc || null,
    preview: track.preview_url,
    duration: track.duration ? timestampToTime(track.duration) : null,
    artist: track.artists.map(i => formatArtistToStandard(i))
  };
}

function formatUserToStandard(user){
  return {
    _obj: 'user',
    _uid: 'spotify-'+user.type+'-'+user.id,
    // Related to the author
    id: user.id,
    name: user.display_name,
    profile: user.external_urls.spotify,
    fullname: null,
    picture: user.images[0] ? user.images[0].url : null,
  };
}

///////////////
// UTILITIES //
///////////////
function sortLastReleases ( a, b ) {
  if ( a.content.updated_at == null ) return 1;
  if ( b.content.updated_at == null ) return -1;

  if ( a.content.updated_at > b.content.updated_at ) {
    return -1;
  }
  if ( a.content.updated_at < b.content.updated_at ) {
    return 1;
  }
  return 0;
}

function sortAlbums ( a, b ) {
  if ( a.release_date == null ) return 1;
  if ( b.release_date == null ) return -1;

  if ( a.release_date > b.release_date ) {
    return -1;
  }
  if ( a.release_date < b.release_date ) {
    return 1;
  }
  return 0;
}

function sortFriends ( a, b ) {
  if ( a.name == null ) return -1;
  if ( b.name == null ) return 1;

  if ( utils.capitalize(a.name) > utils.capitalize(b.name) ) {
    return 1;
  }
  if ( utils.capitalize(a.name) < utils.capitalize(b.name) ) {
    return -1;
  }
  return 0;
}

function timestampToDate(seconds) {
  return moment.unix(seconds).format("YYYY-MM-DD");
}

function timestampToTime(seconds) {
  return moment.unix(seconds).format("mm:ss");
}

exports.getMeAccount = getMeAccount;
exports.getSearch = getSearch;
