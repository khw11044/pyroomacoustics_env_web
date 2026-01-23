"""
Direction of Arrival (DOA) 알고리즘
SRP-PHAT를 사용한 음원 방향 추정
"""
import numpy as np
import pyroomacoustics as pra
from scipy.io import wavfile
import os
from typing import List, Tuple, Dict

# 고정 파라미터
FS = 16000  # 샘플링 레이트 (Hz)
C = 343.0   # 음속 (m/s)
NFFT = 256  # FFT 크기


def run_doa(
    mic_positions: np.ndarray,  # (2, n_mics) or (3, n_mics) - 마이크 절대 좌표 (미터)
    signal_files: List[str],     # 마이크별 혼합 신호 파일 경로
    num_sources: int = 2,        # 추정할 음원 개수
    freq_range: Tuple[int, int] = (300, 3500)  # 주파수 범위 (Hz)
) -> Dict:
    """
    SRP-PHAT DOA 알고리즘 실행

    Args:
        mic_positions: 마이크 좌표 배열 (2D: shape=(2, n_mics), 3D: shape=(3, n_mics))
        signal_files: 각 마이크의 신호 파일 경로 리스트
        num_sources: 추정할 음원 개수
        freq_range: DOA 분석에 사용할 주파수 범위

    Returns:
        {
            "success": bool,
            "message": str,
            "azimuth_grid": List[float],      # 각도 배열 (라디안)
            "spatial_response": List[float],  # 정규화된 spatial response
            "estimated_angles": List[float],  # 추정된 음원 방향 (라디안)
        }
    """
    try:
        n_mics = len(signal_files)

        if n_mics < 2:
            return {
                "success": False,
                "message": "DOA를 위해서는 최소 2개의 마이크가 필요합니다.",
                "azimuth_grid": [],
                "spatial_response": [],
                "estimated_angles": []
            }

        # 마이크 신호 로드
        mic_signals = []
        for filepath in signal_files:
            sr, signal = wavfile.read(filepath)
            if len(signal.shape) > 1:
                signal = signal.mean(axis=1)
            signal = signal.astype(np.float32)
            if np.max(np.abs(signal)) > 1.0:
                signal = signal / 32768.0
            mic_signals.append(signal)

        # 길이 맞추기
        min_length = min(len(s) for s in mic_signals)
        mic_signals = [s[:min_length] for s in mic_signals]

        # (n_mics, n_samples) 형태로 변환
        mics_array = np.array(mic_signals)

        # STFT 분석
        X = pra.transform.stft.analysis(mics_array.T, NFFT, NFFT // 2)
        X = X.transpose([2, 1, 0])  # (n_mics, n_frames, n_freq) -> (n_freq, n_frames, n_mics)

        # 2D인 경우 z=0 추가
        if mic_positions.shape[0] == 2:
            mic_positions_3d = np.vstack([mic_positions, np.zeros(n_mics)])
        else:
            mic_positions_3d = mic_positions

        # SRP-PHAT DOA 객체 생성
        doa = pra.doa.algorithms['SRP'](
            mic_positions_3d,
            FS,
            NFFT,
            c=C,
            num_src=num_sources
        )

        # DOA 추정
        doa.locate_sources(X, freq_range=freq_range)

        # 결과 추출
        azimuth_grid = doa.grid.azimuth.tolist()  # 라디안
        spatial_response = doa.grid.values.copy()

        # 정규화
        min_val = spatial_response.min()
        max_val = spatial_response.max()
        if max_val > min_val:
            spatial_response = (spatial_response - min_val) / (max_val - min_val)
        else:
            spatial_response = np.zeros_like(spatial_response)

        # 추정된 방향 (라디안)
        estimated_angles = doa.azimuth_recon.tolist() if hasattr(doa, 'azimuth_recon') else []

        return {
            "success": True,
            "message": f"DOA 분석 완료! {len(estimated_angles)}개 음원 방향 추정",
            "azimuth_grid": azimuth_grid,
            "spatial_response": spatial_response.tolist(),
            "estimated_angles": estimated_angles
        }

    except Exception as e:
        return {
            "success": False,
            "message": f"DOA 오류: {str(e)}",
            "azimuth_grid": [],
            "spatial_response": [],
            "estimated_angles": []
        }


def calculate_true_angles(
    robot_position: Dict,  # {"x": float, "y": float} in pixels
    source_positions: List[Dict],  # [{"x": float, "y": float}, ...] in pixels
    scale: float = 100.0  # px per meter
) -> List[float]:
    """
    실제 음원 방향 계산 (로봇 기준)

    Args:
        robot_position: 로봇 위치 (픽셀)
        source_positions: 음원 위치들 (픽셀)
        scale: 스케일 (px/m)

    Returns:
        각 음원의 방향 (라디안, 0 = 오른쪽, 반시계 방향 증가)
    """
    angles = []
    robot_x = robot_position["x"]
    robot_y = robot_position["y"]

    for src in source_positions:
        if src is None:
            continue
        dx = src["x"] - robot_x
        dy = src["y"] - robot_y
        # atan2(dy, dx) -> 0 = 오른쪽, 반시계 방향
        # 캔버스 좌표계에서 y는 아래로 증가하므로 -dy 사용
        angle = np.arctan2(-dy, dx)
        if angle < 0:
            angle += 2 * np.pi
        angles.append(angle)

    return angles
