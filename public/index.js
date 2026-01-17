const formulario = document.getElementById('formReserva');
const msg = document.getElementById('msg');
const botonEnviar = document.querySelector('button[type="submit"]');

formulario.addEventListener('submit', async (e) => {
  e.preventDefault();

  // limpiar mensajes previos
  msg.style.display = 'none';
  msg.classList.remove('success', 'error');

  // valores de los campos relevantes
  const numeroReserva = (formulario.querySelector('input[name="numero_reserva"]') || { value: '' }).value.trim();
  const rangoDesde = (formulario.querySelector('input[name="rango_pedidos_desde"]') || { value: '' }).value.trim();
  const rangoHasta = (formulario.querySelector('input[name="rango_pedidos_hasta"]') || { value: '' }).value.trim();

  const tieneReserva = numeroReserva !== '';
  const tieneRango = rangoDesde !== '' || rangoHasta !== '';

  // validación personalizada: al menos uno de los dos debe tener datos
  if (!tieneReserva && !tieneRango) {
    msg.textContent = 'Debe completar el número de reserva o al menos uno de los campos del rango (Desde/Hasta).';
    msg.classList.add('error');
    msg.style.display = 'block';
    formulario.querySelector('input[name="numero_reserva"]').focus();
    return;
  }

  // Validar que el rango "Desde" no sea mayor que "Hasta"
  if (rangoDesde && rangoHasta && rangoDesde > rangoHasta) {
    msg.textContent = 'El rango "Desde" no puede ser mayor que el rango "Hasta".';
    msg.classList.add('error');
    msg.style.display = 'block';
    formulario.querySelector('input[name="rango_pedidos_desde"]').focus();
    return;
  }

  // si pasa validación, construir FormData y enviar
  const formData = new FormData(formulario);

  const now = new Date();
  const fecha = now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                String(now.getDate()).padStart(2, '0');
  const hora = String(now.getHours()).padStart(2, '0') + ':' +
               String(now.getMinutes()).padStart(2, '0') + ':' +
               String(now.getSeconds()).padStart(2, '0');

  formData.append('fecha', fecha);
  formData.append('hora', hora);
  formData.append('servicio', 'Automatizado');

  const textoOriginal = botonEnviar.textContent;
  botonEnviar.textContent = 'Enviando...';
  botonEnviar.disabled = true;

  try {
    const res = await fetch('/api/reservas', {
        method: 'POST',
        body: formData
    });

    const j = await res.json();
    msg.style.display = 'block';

    if (j.ok) {
        msg.textContent = `✅ Reserva enviada con éxito. Registrada el ${fecha} a las ${hora}.`;
        msg.classList.add('success');
        formulario.reset();
    } else {
        msg.textContent = `❌ Error: ${j.error || 'Fallo al procesar la solicitud.'}`;
        msg.classList.add('error');
    }
  } catch (err) {
    msg.style.display = 'block';
    msg.textContent = '❌ Error de red al enviar la solicitud.';
    msg.classList.add('error');
  } finally {
    botonEnviar.textContent = textoOriginal;
    botonEnviar.disabled = false;
  }
});

msg.style.display = 'none';
