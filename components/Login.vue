<template>
  <div>
    <h1>Iniciar Sesión</h1>
    <form v-if="!isVerifying" @submit.prevent="loginUser">
      <label for="username">Usuario</label>
      <input type="text" id="username" v-model="username" required />
      
      <label for="password">Contraseña</label>
      <input type="password" id="password" v-model="password" required />

      <!-- Agregar el reCAPTCHA -->
      <div class="g-recaptcha" data-sitekey="6Lfgu14qAAAAAFoP7VqTrjb_-Yxpg5hLR4Pa6-BK"></div>

      <button type="submit" :disabled="isVerifying">Iniciar Sesión</button>

    </form>

    <form v-if="isVerifying" @submit.prevent="verifyCode">
      <label for="verificationCode">Código de Verificación</label>
      <input type="text" id="verificationCode" v-model="verificationCode" required />

      <button type="submit">Verificar Código</button>
    </form>

    <p v-if="errorMessage" style="color: red;">{{ errorMessage }}</p>
  </div>
</template>

<script>
/* global grecaptcha */
import axios from 'axios';


export default {
  name: 'UsuarioLogin',
  data() {
    return {
      username: '',
      password: '',
      verificationCode: '', // Nuevo campo para el código de verificación
      errorMessage: '',
      isVerifying: false, // Estado para manejar la verificación
    };
  },
  mounted() {
    const recaptchaScript = document.createElement('script');
    recaptchaScript.src = 'https://www.google.com/recaptcha/api.js';
    recaptchaScript.async = true;
    recaptchaScript.defer = true;
    document.body.appendChild(recaptchaScript);
  },
  methods: {
    async loginUser() {
      try {
        const recaptchaToken = grecaptcha.getResponse();

        if (!recaptchaToken) {
          this.errorMessage = 'Por favor completa el reCAPTCHA';
          return;
        }

        const response = await axios.post('http://localhost:3000/login', {
          usuarios: this.username,
          password: this.password,
          recaptchaToken: recaptchaToken,
        });

        if (response.status === 200) {
          this.errorMessage = '';
          this.isVerifying = true; // Cambia a la etapa de verificación
          console.log('Inicio de sesión exitoso, revisa tu correo para el código de verificación');
        }
      } catch (error) {
        if (error.response) {
          if (error.response.status === 403) {
            this.errorMessage = 'La cuenta está bloqueada. Inténtalo más tarde.';
          } else {
            this.errorMessage = error.response.data || 'Error en el inicio de sesión.';
          }
        } else {
          this.errorMessage = 'Error en la configuración de la solicitud: ' + error.message;
        }
        console.error('Error en el inicio de sesión:', error);
      }
    },
    async verifyCode() {
  console.log('Usuario:', this.username);
  console.log('Código de verificación:', this.verificationCode);
  
  try {
    const response = await axios.post('http://localhost:3000/verify-code', {
      usuarios: this.username,
      codigoVerificacion: this.verificationCode,
    });

    if (response.status === 200) {
      // Redirigir a la página de bienvenida
      this.errorMessage = '';
      console.log('Verificación exitosa. Bienvenido!');
      this.$router.push({ name: 'bienvenida' }); // Asegúrate de que la ruta 'bienvenida' esté definida
    }
  } catch (error) {
    // Manejo de errores
    console.error('Error al verificar el código:', error.response ? error.response.data : error.message);
    this.handleError(error);
  }
},
    handleError(error) {
      if (error.response) {
        // Manejar el caso de cuenta bloqueada
        if (error.response.status === 403) {
          this.errorMessage = 'La cuenta está bloqueada. Inténtalo más tarde.';
        } else {
          this.errorMessage = error.response.data || 'Error en el inicio de sesión.';
        }
      } else if (error.request) {
        this.errorMessage = 'No se recibió respuesta del servidor.';
      } else {
        this.errorMessage = 'Error en la configuración de la solicitud: ' + error.message;
      }
      console.error('Error:', error);
    },
  },
};
</script>

<style>
/* Puedes agregar estilos aquí */
</style>
