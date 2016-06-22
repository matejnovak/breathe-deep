$(function(){ 

  var toggleState = true;
  $('.container').on("click", function (event) {
    if(toggleState) {
      $(".a, .b, .c, .d, .e").addClass("boom");
      $(".btn").stop().fadeOut(400);
    } else {
      $(".a, .b, .c, .d, .e").removeClass("boom");
      $(".btn").stop().fadeIn(1000).text("Repeat");
    }
    
    setTimeout(function() {
      toggleState = !toggleState;
    }, 500);

  });

});