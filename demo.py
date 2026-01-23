
import numpy as np
import matplotlib.pyplot as plt
from scipy.io import wavfile
from scipy.signal import fftconvolve
import IPython
import pyroomacoustics as pra

# Location of sources
azimuth = np.array([61., 270.]) / 180. * np.pi
distance = 2.  # meters

c = 343.    # speed of sound
fs = 16000  # sampling frequency
nfft = 256  # FFT size
freq_range = [300, 3500]


snr_db = 5.    # signal-to-noise ratio
sigma2 = 10**(-snr_db / 10) / (4. * np.pi * distance)**2

# Create an anechoic room
room_dim = np.r_[10.,10.]
aroom = pra.ShoeBox(room_dim, fs=fs, max_order=0, sigma2_awgn=sigma2)   


fig, ax = aroom.plot()



echo = pra.circular_2D_array(center=room_dim/2, M=2, phi0=0, radius=37.5e-3)

print(f"echo: {echo}")  # [[5.0375 4.9625] [5.     5.    ]] : <class 'numpy.ndarray'>
print(f"type echo: {type(echo)}") 

echo = np.concatenate((echo, np.array(room_dim/2, ndmin=2).T), axis=1)

print(f"echo: {echo}")  # [[5.0375 4.9625 5.    ] [5.     5.     5.    ]]

aroom.add_microphone_array(pra.MicrophoneArray(echo, aroom.fs))