$(function(){
  $('h1').animate({opacity: 1}, 10);
  var toggleState = true;

  function animateTuts() {
      $('.tuts span:nth-child(1)').animate({ color: '#222222' }, 500);

      timerOne = setTimeout(function() {
        $('.tuts span:nth-child(3)').animate({ color: '#222222' }, 500);
        $('.tuts span:nth-child(1)').animate({ color: '#167abd' }, 500);
      }, 4900);

      timerTwo = setTimeout(function() {
        $('.tuts span:nth-child(5)').animate({ color: '#222222' }, 500);
        $('.tuts span:nth-child(3)').animate({ color: '#167abd' }, 500);
      }, 9800);

      timerThree = setTimeout(function() {
        $('.tuts span:nth-child(5)').animate({ color: '#167abd' }, 500);
      }, 14700);
  }


  $('.container').on("click", function() {
    $('.notes').stop();
    $('.btn').stop();
    $('.tuts span').stop();

    if(toggleState) {
      $('.a, .b, .c, .d, .e').addClass("boom");
      $('.btn').fadeOut(400);
      $('.notes').animate({opacity: 0}, 3000);
      animateTuts();
    } else {
      $('.a, .b, .c, .d, .e').removeClass('boom');
      $('.btn').fadeIn(1000).text('Repeat');
      $('.tuts span').animate({ color: '#167abd' }, 500);
      clearTimeout(timerOne);
      clearTimeout(timerTwo);
      clearTimeout(timerThree);
      $('.notes').text('Breathe, You Are Alive!').animate({opacity: 1}, 4000);
    }
    
    toggleState = !toggleState;

  });

});