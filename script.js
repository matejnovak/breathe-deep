$(function(){

  var toggleState = true;
  $('.container').on("click", function (event) {
    if(toggleState) {
      $('.a, .b, .c, .d, .e').addClass("boom");
      $('.btn').stop().fadeOut(400);
      $('.notes').animate({opacity: 1}, 3000);
      $('.tuts span:nth-child(1)').animate({ color: '#222222' }, 500);

      setTimeout(function() {
        $('.tuts span:nth-child(3)').animate({ color: '#222222' }, 500);
        $('.tuts span:nth-child(1)').animate({ color: '#167abd' }, 500);
      }, 4900);

      setTimeout(function() {
        $('.tuts span:nth-child(5)').animate({ color: '#222222' }, 500);
        $('.tuts span:nth-child(3)').animate({ color: '#167abd' }, 500);
      }, 9800);

      setTimeout(function() {
        $('.tuts span:nth-child(5)').animate({ color: '#167abd' }, 500);
      }, 14700);

    } else {
      $('.a, .b, .c, .d, .e').removeClass('boom');
      $('.btn').stop().fadeIn(1000).text('Repeat');
    }
    
    setTimeout(function() {
      toggleState = !toggleState;
      $('.notes').animate({opacity: 0}, 2100);
    }, 500);

    

  });

});