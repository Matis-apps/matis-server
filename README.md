# matis-server
The musical's social network.
Web server to retrieve the API's content.

## Technologies behind
### NodeJS
<p align="center">
  <a href="https://nodejs.org/">
    <img
      alt="Node.js"
      src="https://nodejs.org/static/images/logo-light.svg"
      width="400"
    />
  </a>
</p>

## Endpoints

### [Deezer services](api/routes/deezer.js)
* Get current user's loved artists : `GET /deezer/artists`
* Get artist content : `GET /deezer/artist/:id`
* Get related artist content : `GET /deezer/artist/:id/related`
* Get user's loved albums : `GET /deezer/albums/:user_id`
* Get user's playlists : `GET /deezer/playlists`
* Get current user's last releases : `GET /deezer/releases`
* Get user's last releases : `GET /deezer/releases/:user_id`
* Get release's content : `GET /deezer/:obj/:id`

-- obj: album, playlist
-- id: Depending on the obj - album: album_id, playlist: playlist_id