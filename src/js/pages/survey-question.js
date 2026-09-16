function selectAnswer(el) {
    var group = el.parentNode.querySelectorAll('.answer-item');
    group.forEach(function (item) {
        item.classList.remove('selected');
    });
    el.classList.add('selected');
}
