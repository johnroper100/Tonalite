Vue.component('Modal', {
    template: '#modal-template',
    props: ['show'],
    methods: {
        close: function () {
            this.$emit('close');
        }
    }
});

Vue.component('AddModal', {
    template: '#add-modal-template',
    props: ['show'],
    data: function () {
        return {
            title: '',
            body: ''
        };
    },
    methods: {
        close: function () {
            this.$emit('close');
            this.title = '';
            this.body = '';
        },
        savePost: function () {
            // Some save logic goes here...

            this.close();
        }
    }
});
new Vue({
    el: '#app',
    data: {
        showAddModal: false
    }
});