use web_sys::{AudioContext, OscillatorType};
pub struct Sounds {
    ctx: Option<AudioContext>,
    pub muted: bool,
}
impl Sounds {
    pub fn new() -> Self {
        let muted = web_sys::window()
            .and_then(|w| w.local_storage().ok().flatten())
            .and_then(|s| s.get_item("jungle-muted").ok().flatten())
            .is_some_and(|v| v == "1");
        Self { ctx: None, muted }
    }
    pub fn unlock(&mut self) {
        if self.ctx.is_none() {
            self.ctx = AudioContext::new().ok()
        }
        if let Some(c) = &self.ctx
            && c.state() == web_sys::AudioContextState::Suspended
        {
            let _ = c.resume();
        }
    }
    pub fn toggle(&mut self) {
        self.muted = !self.muted;
        if let Some(s) = web_sys::window().and_then(|w| w.local_storage().ok().flatten()) {
            let _ = s.set_item("jungle-muted", if self.muted { "1" } else { "0" });
        }
    }
    fn tone(
        &self,
        freq: f32,
        duration: f64,
        gain: f32,
        delay: f64,
        triangle: bool,
        end: Option<f32>,
    ) {
        let Some(c) = &self.ctx else { return };
        let _ = (|| -> Result<(), wasm_bindgen::JsValue> {
            let osc = c.create_oscillator()?;
            let amp = c.create_gain()?;
            let t = c.current_time() + delay;
            osc.set_type(if triangle {
                OscillatorType::Triangle
            } else {
                OscillatorType::Sine
            });
            osc.frequency().set_value_at_time(freq, t)?;
            if let Some(end) = end {
                osc.frequency()
                    .exponential_ramp_to_value_at_time(end, t + duration)?;
            }
            amp.gain().set_value_at_time(0.0, t)?;
            amp.gain().linear_ramp_to_value_at_time(gain, t + 0.012)?;
            amp.gain()
                .exponential_ramp_to_value_at_time(0.0001, t + duration)?;
            osc.connect_with_audio_node(&amp)?;
            amp.connect_with_audio_node(&c.destination())?;
            osc.start_with_when(t)?;
            osc.stop_with_when(t + duration + 0.02)?;
            Ok(())
        })();
    }
    pub fn play(&self, event: &str) {
        if self.muted {
            return;
        }
        match event {
            "capture" => self.tone(190.0, 0.14, 0.09, 0.0, true, Some(110.0)),
            "win" => {
                self.tone(523.0, 0.12, 0.07, 0.0, false, None);
                self.tone(659.0, 0.12, 0.07, 0.11, false, None);
                self.tone(784.0, 0.2, 0.07, 0.22, false, None)
            }
            "draw" => {
                self.tone(233.0, 0.16, 0.06, 0.0, false, None);
                self.tone(185.0, 0.24, 0.06, 0.15, false, None)
            }
            _ => self.tone(540.0, 0.06, 0.05, 0.0, false, None),
        }
    }
}
