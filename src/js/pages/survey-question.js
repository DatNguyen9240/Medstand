    function selectAnswer(el) {
      var group = el.parentNode.querySelectorAll('.answer-item');
      group.forEach(item => item.classList.remove('selected'));
      el.classList.add('selected');
    }
