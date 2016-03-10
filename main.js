/*
//app css includes
requireCss('contacts/css/share');
requireCss('contacts/css/multi-select');
requireCss('contacts/css/jquery.ocaddnew');
requireCss('contacts/css/contacts');
requireCss('contacts/css/jquery.Jcrop.min');

//app css includes
requireCss('contacts/bower_components/ui-multiselect/jquery.multiselect');

function requireCss(path) {
  var link = document.createElement("link");
  link.type = "text/css";
  link.rel = "stylesheet";
  link.href = path + ".css";
  document.getElementsByTagName("head")[0].appendChild(link);
}
*/

/**
 * Listens for the app launching then creates the window
 *
 * @see http://developer.chrome.com/apps/app.runtime.html
 * @see http://developer.chrome.com/apps/app.window.html
 */
chrome.app.runtime.onLaunched.addListener(function() {
  // Center window on screen.
  var screenWidth = screen.availWidth;
  var screenHeight = screen.availHeight;
  var width = 500;
  var height = 300;

  chrome.app.window.create('index.html', {
    id: "helloWorldID",
    outerBounds: {
      width: width,
      height: height,
      left: Math.round((screenWidth-width)/2),
      top: Math.round((screenHeight-height)/2)
    }
  });
});
