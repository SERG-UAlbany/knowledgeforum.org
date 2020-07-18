$(document).ready(function() {

  // event to toggle sidebar on select server button click
  document.getElementById('menu-toggle').onclick = function() {
    var div = document.getElementById('wrapper');
    if (div.className == "d-flex") {
      div.className = "d-flex toggled";
    } else {
      div.className = "d-flex";
    }
  };

  // event to add functionality to logout button
  document.getElementById('logout').onclick = function() {
    localStorage.clear();
    window.location.href = "../index.html";
  };

  appendUserServers();

});

// adds the users servers to the side bar
function appendUserServers(){
  var uname = localStorage.key(0);
  var data = JSON.parse(localStorage.getItem(uname));
  var serverList = document.getElementById("server-list");

  for(i in data){
    var serverName = getServerName(data[i][0]);
    if(i == 0){
      $("#server-list").append("<li onclick='loadServer(\"" + data[i][0] + "\")' class = 'active'>" + serverName + "</li>");
      loadServer(data[i][0]);
    } else {
      $("#server-list").append("<li onclick='loadServer(\"" + data[i][0] + "\")' class = ''>" + serverName + "</li>");
    }
  }

  // event to juggle active tag to most recently clicked server
  $('#server-list').on('click','li', function(){
   $(this).addClass('active').siblings().removeClass('active');
  });

}

// replaces the "join community" and "my knowledge building communities" sections
// with the relevant information for the specified server
function loadServer(url){

  var serverCommunitiesData = getCommunities(url);
  serverCommunitiesData.then(function(result) {
    appendCommunities(result);
  });

  var userCommunitiesData = getUserCommunities(url);
  userCommunitiesData.then(function(result) {
    appendUserCommunities(result);
  });

  var userInfo = getUserInfo(url);
  userInfo.then(function(result) {
    var firstName = result.firstName;
    var lastName = result.lastName;
    $('#welcome').replaceWith('<div class="welcome" id="welcome">Welcome, ' + firstName + ' ' + lastName + '</div>');
  });

}


// returns the users token for the specified server
function extractTokenFromStorage(url) {
  var uname = localStorage.key(0);
  var data = JSON.parse(localStorage.getItem(uname));

  for (i in data) {
    if (data[i][0] == url) {
      return data[i][1];
    }
  }
}


// retrieves the users information for the specified server
function getUserInfo(url) {
  var token = extractTokenFromStorage(url);

  return fetch(url + 'api/users/me', {
    method: "GET",
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
  }).then(function(response) {
      if(response.status == 401){
        tokenErrorHandler();
      } else {
        return response.json();
      }
  }).then(function(body) {
      return (body);
  }).catch(function(error) {
      return ("Error:", error);
  });
}


// returns a promise for all the communities from the specified server
function getCommunities(url) {
  var token = extractTokenFromStorage(url);

  return fetch(url + 'api/communities', {
    method: "GET",
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
  }).then(function(response) {
    if(response.status == 401){
      tokenErrorHandler();
    } else {
      return response.json();
    }
  }).then(function(body) {
      return (body);
  }).catch(function(error) {
      return ("Error:", error);
  });
}


// appends all the servers communities to the community choice dropdown
function appendCommunities(data) {
  $('#communityChoiceDropdown').replaceWith('<select value="getCommunity" class="communityChoiceDropdown" id="communityChoiceDropdown" required></select>');

  for(var i = 0; i < data.length; i++){
    var title = data[i].title;
    $('#communityChoiceDropdown').append('<option>' + title + '</option>');
  }
}


// returns a promise for all the communities a user is a part of in the specified server
function getUserCommunities(url) {
  var token = extractTokenFromStorage(url);

  return fetch(url + 'api/users/myRegistrations', {
    method: "GET",
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
  }).then(function(response) {
    if(response.status == 401){
      tokenErrorHandler();
    } else {
      return response.json();
    }
  }).then(function(body) {
      return (body);
  }).catch(function(error) {
      return ("Error:", error);
  });

}


// appends all the users servers communities to their list of knowledge building communities
function appendUserCommunities(data) {
  $('#userCommunities').replaceWith("<ul class='userCommunities' id = 'userCommunities'></ul>");

  for(var i = 0; i < data.length; i++){
    var title = data[0]._community.title;
    var id = data[0].communityId;
    $('#userCommunities').append('<li><p>' + title + '</p><button class="enterButton" type="button" onclick="joinCommunity(\'' + id + '\')">Enter Community</button></li>');
  }

}

// function to handle an expired/invalid user token
// called if response status is 401 (might be errors other than invalid token)
function tokenErrorHandler(){
  alert("User authorization token expired");
  localStorage.clear();
  window.location.href = "../index.html";
}