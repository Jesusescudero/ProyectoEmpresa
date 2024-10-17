import { createRouter, createWebHistory } from 'vue-router';
import Login from './components/Login.vue';
import Registro from './components/Registro.vue';
import Bienvenida from './components/Bienvenida.vue'; // Importa el componente de bienvenida

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
  },
  {
    path: '/register',
    name: 'Registro',
    component: Registro,
  },
  {
    path: '/bienvenida', // Ruta para la página de bienvenida
    name: 'bienvenida',
    component: Bienvenida, // Asegúrate de que este componente esté creado
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
