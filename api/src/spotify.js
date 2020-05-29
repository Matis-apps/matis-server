const https = require('https');
const sleep = require('await-sleep');
const moment1 = require('moment');
const moment2 = require('moment-timezone');
const utils = require('../../utils');

const call_limit = 50; // Limit of items to retrieve
const retry_limit = 10; // Limit number of retry
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
            } else if (json.error) { // json has an error
              reject(utils.error(json.error.message, json.error.code));
            } else { // otherwise, json is ok
              resolve(json)
            }
          } else {
            if(json.error) {
              if (response.statusCode == 429 && response.headers['retry-after']) {
                let retry_after = response.headers['retry-after'] ? response.headers['retry-after']*1000 : retry_timeout;
                reject(utils.error(retry_after, response.statusCode));
              } else {
                reject(utils.error(json.error.message, response.statusCode));
              }
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

function genericHttps(access_token, path) {
  return new Promise(async (resolve, reject) => {
    var result = null;
    var error = null;
    var retry = retry_limit;
    
    // get the general data of the artist
    do {
      const options = {
        hostname: 'api.spotify.com',
        path: path,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer '+access_token,
          'content-type': 'text/json'
        },
      };

      try {
        result = await httpsCall(options) // await for the response
      } catch(err) {
        error = err;
        if(error.code == 429) retry-- && await sleep(error.message);// code 4 == quota limit
        else retry = 0;
      }
    } while (!result && retry > 0); // loop while there is another page

    if (result) {
      resolve(result);
    } else if (error) {
      reject(error);
    } else {
      reject(utils.error("Something went wrong..."));
    }
  })
}

function recursiveHttps(access_token, path) {
  return new Promise((resolve, reject) => {
    var result = [];
    /**
     * recursive Fill the result array and handle the pagination recursively
     * @params index
     * @params retry
     */
    let recursive = async function (index = 0, retry = retry_limit) {
      // Configuration of the https request
      const options = {
        hostname: 'api.spotify.com',
        path: path + 'offset=' + index + '&limit='+call_limit,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer '+access_token,
          'content-type': 'text/json'
        },
      };

      try {
        let response = await httpsCall(options);

        var itemMainKey = Object.keys(response)[0];

        if (response[itemMainKey].items) {
          Array.prototype.push.apply(result, response[itemMainKey].items)
          if(response[itemMainKey].next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(result)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(result);
          }
        } else if (response.items) {
          Array.prototype.push.apply(result, response.items)
          if(response.next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(result)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(result);
          }
        } else {
          throw utils.error("Unvalid data", 500);
        }
      } catch(error) {
        if (retry > 0 && error.code == 429) { // too many request and still have a retry, so wait for a delay and get back
          setTimeout(recursive, error.message, index, retry-1);
        } else {
          reject(utils.error(error.message || "Something went wrong...", error.code || 500));
        }
      }
    };

    recursive()
  })
}

////////////////
// FETCH DATA //
////////////////
async function fetchSearch(access_token, type, query, strict) {
  return new Promise((resolve, reject) => {
    const path = '/v1/search?type='+type+'&q='+encodeURI(query);
    genericHttps(access_token, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
  });
}


async function fetchPlaylists(access_token) {
  return new Promise((resolve, reject) => {
    const path = '/v1/me/playlists?';
    recursiveHttps(access_token, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
  });
}

async function fetchPlaylist(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/playlists/'+id;
    genericHttps(access_token, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
  });
}

/**
 * getPlaylistContent Return the artist content with its albums
 * @params id
 */
function fetchPlaylistContent(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/playlists/'+id+'/tracks?';
    recursiveHttps(access_token, path)
      .then(result => {
        resolve(result);
      })
      .catch(error => reject(error));
  });
}

/**
 * fetchArtists
 * @params user_id
 * @params access_token
 */
function fetchArtists(access_token) {
  return new Promise((resolve, reject) => {
    const path = '/v1/me/following?type=artist&';
    recursiveHttps(access_token, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => reject(error));
  });
}

/**
 * fetchArtist
 * @params id
 */
function fetchArtist(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/artists/' + id;
    genericHttps(access_token, path)
      .then(result => {
        return result
      })
      .then(async (artist) => {
        await fetchArtistAlbums(access_token, id) // await for the response
          .then(artistAlbums => {
            artist.albums = artistAlbums.sort((a,b) => sortAlbums(a,b));
            resolve(artist);
          });
      })
      .catch(error => {
        reject(error)
      });
  });
}

/**
 * fetchArtistAlbums
 * @params artist_id
 * @params access_token
 */
function fetchArtistAlbums(access_token, artist_id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/artists/' + artist_id + '/albums?';
    recursiveHttps(access_token, path)
      .then(artistAlbums => {
        resolve(artistAlbums);
      })
      .catch(error => {
        reject(error)
      });
  });
}


/**
 * fetchAlbum
 * @params id
 */
function fetchAlbum(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/albums/'+id;
    genericHttps(access_token, path)
      .then(result => {
        resolve(result);
      })
      .catch(error => reject(error));
  });
}

/**
 * fetchTrack
 * @params id
 */
function fetchTrack(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/tracks/'+id;
    genericHttps(access_token, path)
      .then(result => {
        resolve(result);
      })
      .catch(error => reject(error));
  });
}

//////////////
// SERVICES //
//////////////
async function getMeAccount(access_token) {
  return new Promise((resolve, reject) => {
    const path = '/v1/me';
    genericHttps(access_token, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
  });
}

function getPlaylistArtistRelease(access_token, id) {
  return new Promise((resolve, reject) => {
    fetchPlaylistContent(access_token, id)
      .then(results => {
        var artists = []
        results.forEach(item => {
          item.track.artists.forEach(artist => {
            let existingArtist = artists.find(e => {
              return e.id == artist.id;
            })
            if (!existingArtist) {
              artists.push(artist)
            }
          })
        })
        return artists;
      })
      .then(async (artists) => {
        var releases = []
        await Promise
          .all(artists.map(i => 
            fetchArtist(access_token, i.id).catch(err => console.log(err)))
          )
          .then(results => {
            results.forEach((a) => {
              if (a.albums && a.albums.length > 0) {
                let formatedAlbum = formatArtistToFeed(a);
                let existingArtist = releases.find(e => {
                  return e.author.id == formatedAlbum.author.id;
                })
                if (!existingArtist) {
                  releases.push(formatedAlbum);
                }
              }
            })
          }).catch(err => reject(error));

        releases.sort((a,b) => sortLastReleases(a,b));
        resolve(releases);
      })
      .catch(error => reject(error));
  });
}


async function getSearch(access_token, query, types = "*", strict = false) {
  const allowedTypes = ['artist', 'album', 'playlist', 'track'];
  var search_types = [];
  var results = new Object;
  var error;

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
        .then(async (result) => {
          var itemMainKey = Object.keys(result)[0];
          if (strict && result[itemMainKey].items) {
            result[itemMainKey].items = result[itemMainKey].items.filter(item => query.toUpperCase().includes(item.name.toUpperCase()));
          }
          switch(type) {
            case 'artist':
              results.artists = result.artists.items.map(i => formatArtistToStandard(i));
              break;
            case 'album':
              await Promise
                .all(result.albums.items.map(i => fetchAlbum(access_token, i.id).catch(err => error = err)))
                .then(albums => {
                  results.albums = albums.map(i => formatAlbumToStandard(i));
                })
                .catch(err => error = err);
              break;
            case 'playlist':
              results.playlists = result.playlists.items.map(i => formatPlaylistToStandard(i));
              break;
            case 'track':
              await Promise
                .all(result.tracks.items.map(i => fetchTrack(access_token, i.id).catch(err => error = err)))
                .then(tracks => {
                  results.tracks = tracks.map(i => formatTrackToStandard(i));
                }).catch(err => error = err);
              break;
          }
        })
        .catch(err => error = err)
    })
  } else {
    error = utils.error("Bad t paramater", 400)
  }

  return new Promise((resolve, reject) => {
    if (results.length == 0) {
      if (error) {
        reject(error)
      } else {
        reject(utils.error("No content", 404))
      }
    } else {
      resolve(results)
    }
  })
}


function searchAlbumUPC(access_token, query, upc) {
  return new Promise(async (resolve, reject) => {

    var album = null;
    var error = null;
    var index = 0;
    var limit = call_limit; // improve the performances due to fullAlbums.filter
    var total = limit;
    
    var albums, fullAlbums;
    do {
      albums = fullAlbums = null;
      const path = '/v1/search?type=album&limit=' + limit + '&offset=' + index + '&q=' + encodeURIComponent(utils.removeParentheses(query));
      try {
        albums = await genericHttps(access_token, path);
        if(albums && albums.albums && albums.albums.items) {
          total = albums.albums.total;
          try {
            fullAlbums = await Promise.all(albums.albums.items.map(i => fetchAlbum(access_token, i.id)));
            // fullAlbums = await Promise.all(albums.albums.items.filter(i => utils.checkSize(query, i.name)).map(i => fetchAlbum(access_token, i.id)));
          } finally {
            if (fullAlbums) {
              album = fullAlbums.find(a => utils.isSameUPC(a.external_ids.upc, upc));
              album = album ? formatAlbumToStandard(album) : null;
            } else {
              throw utils.error("Invalid data", 500)
            }
          }
        } else {
          throw utils.error("Invalid data", 500)
        }
      } catch(err) {
        error = err;
      } finally {
        index+=limit;
      }
    } while (!album && total > index)

    if (album) {
      resolve(album)
    } else if (error) {
      reject(error)
    } else {
      reject(utils.error("Not found", 200))
    }
  });
}

function searchTrackISRC(access_token, query, isrc) {
  return new Promise(async (resolve, reject) => {

    var track = null;
    var error = null;
    var index = 0;
    var limit = call_limit/2; // improve the performances due to fullAlbums.filter
    var total = limit;

    var tracks, fullTracks;
    do {
      tracks = fullTracks = null;
      const path = '/v1/search?type=track&limit=' + limit + '&offset=' + index + '&q=' + encodeURI(query);

      try {
        tracks = await genericHttps(access_token, path);
        if(tracks && tracks.tracks && tracks.tracks.items) {
          total = tracks.tracks.total;
          try {
            fullTracks = await Promise.all(tracks.tracks.items.filter(i => utils.checkSize(query, i.title)).map(i => fetchTrack(access_token, i.id)))
            //fullAlbums = await Promise.all(albums.data.map(i => fetchAlbum(i.id)))
          } finally {
            if (fullTracks) {
              track = fullTracks.filter(a => a.external_ids.isrc == isrc);
              track = track[0] ? formatTrackToStandard(track[0]) : null;
            } else {
              throw utils.error("Invalid data", 500)
            }
          }
        } else {
          throw utils.error("Invalid data", 500)
        }
      } catch(err) {
        error = err;
      } finally {
        index+=limit;
      }
    } while (!track && total > index)

    if (track) {
      resolve(track)
    } else if (error) {
      reject(error)
    } else {
      reject(utils.error("Not found", 200))
    }
  });
}


/**
 * getMyReleases
 * @params user_id
 * @params access_token
 */
async function getMyReleases(access_token) {
  const user_id = 'me';
  var releases = [];
  var error;

  const artists = await fetchArtists(access_token).catch(err => error = err);

  if(artists && artists.length > 0) {
    await Promise
      .all(artists.map(i => 
        fetchArtist(access_token, i.id).catch(err => error = err))
      )
      .then(results => {
        results.forEach((a) => {
          if (a.albums && a.albums.length > 0) {
            releases.push(formatArtistToFeed(a));
          }
        })
      }).catch(err => error = err);
  }
  
  var genres = [];
  if(releases && releases.length > 0) {
    var availableGenres = [];
    releases.forEach(i => {
      Array.prototype.push.apply(availableGenres, i.content.genre.split(':'))
    })
    genres = [...new Set(availableGenres.sort())];
    genres.unshift("Tous");

    var key = 0;
    genres = genres.map(i => new Object({
      key: ++key,
      value: i,
    }))

    releases.forEach(i => {
      var formated = [];
      i.content.genre.split(':').forEach(g => {
        let existingGenre = genres.find(e => {
          return g == e.value
        })
        formated.push(existingGenre.key)
      })
      i.content.genre = formated.join(':');
    })
  }
  releases.genres = genres;

  const playlists = await fetchPlaylists(access_token).catch(err => error = err);
  if(playlists && playlists.length > 0) {
    await Promise
      .all(playlists.map(i => 
        fetchPlaylist(access_token, i.id).catch(err => error = err))
      )
      .then(results => {
        results.forEach((a) => {
          releases.push(formatPlaylistToFeed(a));
        })
      }).catch(err => error = err);
  }

  return new Promise((resolve, reject) => {
    if (releases.length == 0) {
      if (error) {
        reject(error);
      } else {
        reject(utils.error("No content"), 404);
      }
    } else {
      releases.sort((a,b) => sortLastReleases(a,b));
      resolve(releases)
    }
  });
}


/**
 * getReleaseContent
 * @params obj
 * @params id
 */
function getReleaseContent(access_token, obj, id) {
  return new Promise((resolve, reject) => {
    if(obj === 'album') {
      // retrieve the general content
      const promise = fetchAlbum(access_token, id)
        .then((response) => {
          resolve(formatAlbumToFeed(response));
          //return formatAlbumToFeed(response);
        }).catch(err => reject(err));

      // retrieve the related artists
      promise.then((release) => {
        getRelatedArtists(access_token, release.author.id).then((response) => {
          release.related = response;
          release.related.sort((a,b) => sortLastReleases(a,b));
          resolve(release);
        }).catch(err => reject(err));
      }).catch(err => reject(err));
    } /*else if (obj === 'playlist') {
      getPlaylistContent(id)
        .then((response) => {       
          resolve(formatPlaylistToFeed(response));          
        }).catch(err => reject(err));
    }*/ else {
      reject(utils.error('No content', 404))
    }
  });
}

function getMyPlaylists(access_token) {
  return new Promise((resolve, reject) => {
    fetchPlaylists(access_token)
    .then((response) => {
      resolve(response.map(i => formatPlaylistToStandard(i)))
    }).catch(err => reject(err));
  });
}

/**
 * getGenres
 * @params id
 */
function getGenres(access_token) {
  return new Promise((resolve, reject) => {
    const path = '/v1/recommendations/available-genre-seeds';
    genericHttps(access_token, path)
      .then(result => {
        resolve(result);
      })
      .catch(error => reject(error));
  });
}

////////////////////////
// FORMAT TO STANDARD //
////////////////////////
function formatArtistToStandard(artist) {
  return {
    _obj: 'artist',
    _from: 'spotify',
    _uid: 'spotify-'+artist.type+'-'+artist.id,
    // Related to the author
    id: artist.id,
    name: artist.name,
    picture: artist.images && artist.images.length > 0 ? artist.images[0].url : null,
    link: artist.external_urls.spotify ? artist.external_urls.spotify : "https://open.spotify.com/artist/"+artist.id,
    albums: /*artist.albums ? artist.albums.data.map(i => formatAlbumToStandard(i)) :*/ null,
    nb_albums: /*artist.nb_album ? artist.nb_album :*/ null,
    nb_fans: artist.followers ? artist.followers.total : null,
    added_at: null,
  };
}

function formatAlbumToStandard(album){
  return {
    _obj: 'album',
    _from: 'spotify',
    _uid: 'spotify-'+album.album_type+'-'+album.id,
    // Related to the author
    id: album.id,
    name: album.name,
    type: album.album_type,
    picture: album.images && album.images.length > 0 ? album.images[0].url : null,
    link: album.external_urls.spotify ? album.external_urls.spotify : "https://open.spotify.com/album/"+album.id,
    upc: album.external_ids ? album.external_ids.upc : null,
    artists: album.artists.map(i => formatArtistToStandard(i)),
    updated_at: album.release_date,
    added_at: null,
  };
}

function formatPlaylistToStandard(playlist){
  return {
    _obj: 'playlist',
    _from: 'spotify',
    _uid: 'spotify-'+playlist.type+'-'+playlist.id,
    // Related to the author
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    picture: playlist.images && playlist.images.length > 0 ? playlist.images[0].url : null,
    link: playlist.external_urls.spotify ? playlist.external_urls.spotify : "https://open.spotify.com/playlist/"+playlist.id,
    updated_at: null,
    added_at: null,
  };
}

function formatTrackToStandard(track){
  return {
    _obj: 'track',
    _from: 'spotify',
    _uid: 'spotify-'+track.type+'-'+track.id,
    // Related to the author
    id: track.id,
    name: track.name,
    link: track.external_urls ? track.external_urls.spotify : "https://open.spotify.com/track/"+track.id,
    isrc: track.external_ids ? track.external_ids.isrc : null,
    preview: track.preview_url,
    duration: track.duration_ms ? timestampToTime(track.duration_ms) : null,
    updated_at: track.album ? track.album.release_date : null,
    artist: track.artists ? track.artists.map(i => formatArtistToStandard(i)) : track.track.artists.map(i => formatArtistToStandard(i))
  };
}

function formatUserToStandard(user){
  return {
    _obj: 'user',
    _from: 'spotify',
    _uid: 'spotify-'+user.type+'-'+user.id,
    // Related to the author
    id: user.id,
    name: user.display_name,
    profile: user.external_urls.spotify,
    fullname: null,
    picture: user.images[0] ? user.images[0].url : null,
  };
}

//////////////////////////////
// FORMAT TO FEED (RELEASE) //
//////////////////////////////
function formatArtistToFeed(artist){
  const firstAlbum = artist.albums[0];
  const firstArtistAlbum = artist.albums[0].artists[0];

  return {
    _obj: 'album',
    _from: 'spotify',
    _uid: 'deezer-'+firstAlbum.album_type+'-'+artist.id+'-'+artist.albums[0].id,
    // Related to the author
    author: {
      id: firstArtistAlbum.id,
      name: firstArtistAlbum.name,
      picture: firstArtistAlbum.images && firstArtistAlbum.images.length > 0 ? firstArtistAlbum.images[0].url : null,
      link: firstArtistAlbum.external_urls.spotify ? firstArtistAlbum.external_urls.spotify :  "https://open.spotify.com/artist/"+artist.id,
      added_at: null,
    },
    // Related to the content
    content: {
      id: firstAlbum.id,
      title: firstAlbum.name,
      description: 'Based on your feed with ' + artist.name,
      type: firstAlbum.album_type,
      picture: firstAlbum.images[0] ? firstAlbum.images[0].url : null,
      link: firstAlbum.external_urls.spotify,
      upc: firstAlbum.upc || null,
      genre: artist.genres ? artist.genres.join(':') : '',
      updated_at: firstAlbum.release_date,
      //last: artist.albums[0],
    }
  };
}

function formatAlbumToFeed(album) {
  const mainArtist = album.artists[0];
  return {
    _obj: 'album',
    _from: 'spotify',
    _uid: 'deezer-'+album.album_type+'-'+mainArtist.id+'-'+album.id,
    // Related to the author
    author: {
      id: mainArtist.id,
      name: mainArtist.name,
      picture: mainArtist.images && mainArtist.images.length > 0 ? mainArtist.images[0].url : null,
      link: mainArtist.external_urls.spotify,
      added_at: null,
    },
    // Related to the content
    content: {
      id: album.id,
      title: album.name,
      description: 'Based on an album you liked',
      type: album.album_type,
      picture: album.images && album.images.length > 0 ? album.images[0].url : null,
      link: album.external_urls.spotify,
      upc: album.external_ids.upc || null,
      genre: album.genres.join(':') ? mainArtist.genres.join(':') : '',
      updated_at: album.release_date,
      tracks: album.tracks ? album.tracks.items.map(i => formatTrackToStandard(i)) : null,
      //last: album,
    },
  };
}

function formatPlaylistToFeed(playlist) {
  return {
    _obj: 'playlist',
    _from: 'spotify',
    _uid: 'spotify-'+playlist.type+'-'+playlist.owner.id+'-'+playlist.id,
    // Related to the author
    author: {
      id: playlist.owner.id,
      name: playlist.owner.display_name,
      picture: null,
      link: playlist.owner.external_urls.spotify,
      added_at: null, 
    },
    // Related to the content
    content: {
      id: playlist.id,
      title: playlist.name,
      description: playlist.description,
      type: playlist.type,
      picture: playlist.images && playlist.images.length > 0 ? playlist.images[0].url : null,
      link: playlist.external_urls.spotify,
      genre: '',
      updated_at: playlist.tracks && playlist.tracks.items ? timestampToDate(Math.max.apply(null, playlist.tracks.items.map(i => timezoneToTimestamp(i.added_at))))
                : null, 
      tracks: playlist.tracks && playlist.tracks.items ? playlist.tracks.items.map(i => formatTrackToStandard(i)) : null,
      //last: playlist,
    },
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

function timezoneToTimestamp(timezone) {
  return moment2.tz(timezone,'Europe/Paris').unix();
}

function timestampToDate(timestamp) {
  return moment1.unix(timestamp).format("YYYY-MM-DD");
}

function timestampToTime(seconds) {
  return moment1.unix(seconds).format("mm:ss");
}

exports.getMeAccount = getMeAccount;
exports.getSearch = getSearch;
exports.searchAlbumUPC = searchAlbumUPC;
exports.searchTrackISRC = searchTrackISRC;
exports.getMyReleases = getMyReleases;
exports.getReleaseContent = getReleaseContent;
exports.getMyPlaylists = getMyPlaylists;
exports.getPlaylistArtistRelease = getPlaylistArtistRelease;
