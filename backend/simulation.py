import numpy as np
import pyroomacoustics as pra
from scipy.io import wavfile
import os
import uuid
from typing import List, Tuple

# 고정 파라미터
FS = 16000           # 샘플링 레이트 (Hz)
MAX_ORDER = 3        # 반사 차수
ABSORPTION = 0.2     # 벽 흡음 계수
ROOM_HEIGHT = 2.5    # 방 높이 (m)
MIC_HEIGHT = 1.0     # 마이크 높이 (m)
SOURCE_HEIGHT = 1.0  # 음원 높이 (m)


def pixels_to_meters(coords: List[dict], scale: float) -> np.ndarray:
    """
    픽셀 좌표를 미터 좌표로 변환
    coords: [{"x": px, "y": py}, ...]
    scale: 픽셀/미터 비율 (예: 100 = 100px당 1m)
    반환: [[x1, x2, ...], [y1, y2, ...]] 형태의 numpy 배열
    """
    xs = [p["x"] / scale for p in coords]
    ys = [p["y"] / scale for p in coords]
    return np.array([xs, ys])


def run_simulation(
    room_coords: List[dict],
    robot_position: dict,
    robot_radius: float,
    microphones: List[dict],
    audio_sources: List[dict],
    audio_files: dict,  # {filename: file_path}
    scale: float = 100.0,
    output_dir: str = "outputs"
) -> Tuple[bool, str, List[str]]:
    """
    pyroomacoustics 시뮬레이션 실행

    Args:
        room_coords: 방 꼭짓점 좌표 [{"x": px, "y": py}, ...]
        robot_position: 로봇 중심 좌표 {"x": px, "y": py}
        robot_radius: 로봇 반지름 (픽셀)
        microphones: 정규화된 마이크 좌표 [{"nx": float, "ny": float}, ...]
        audio_sources: 음원 정보 [{"name": str, "position": {"x": px, "y": py}}, ...]
        audio_files: 업로드된 오디오 파일 경로 {filename: path}
        scale: 픽셀/미터 변환 비율
        output_dir: 결과 파일 저장 디렉토리

    Returns:
        (success, message, output_files)
    """
    try:
        os.makedirs(output_dir, exist_ok=True)

        # 1. 방 꼭짓점 좌표 변환 (픽셀 → 미터)
        corners = pixels_to_meters(room_coords, scale)

        # 2. 방 생성
        room = pra.Room.from_corners(
            corners,
            fs=FS,
            max_order=MAX_ORDER,
            materials=pra.Material(ABSORPTION, ABSORPTION),
            ray_tracing=True,
            air_absorption=True
        )

        # 3. 3D로 확장 (높이 2.5m)
        room.extrude(ROOM_HEIGHT, materials=pra.Material(ABSORPTION, ABSORPTION))

        # 4. 마이크 배열 설정
        if len(microphones) == 0:
            return False, "마이크가 배치되지 않았습니다.", []

        # 로봇 위치 (미터)
        robot_x = robot_position["x"] / scale
        robot_y = robot_position["y"] / scale
        robot_r = robot_radius / scale

        # 마이크 좌표 계산 (로봇 기준 상대 좌표 → 절대 좌표)
        mic_positions = []
        for mic in microphones:
            mx = robot_x + mic["nx"] * robot_r
            my = robot_y + mic["ny"] * robot_r
            mz = MIC_HEIGHT
            mic_positions.append([mx, my, mz])

        # numpy 배열로 변환 [[x1,x2,...], [y1,y2,...], [z1,z2,...]]
        R = np.array(mic_positions).T

        # 5. 모든 음원을 방에 추가
        source_count = 0
        for source in audio_sources:
            if source["position"] is None:
                continue

            src_x = source["position"]["x"] / scale
            src_y = source["position"]["y"] / scale
            src_z = SOURCE_HEIGHT

            filename = source["name"]
            if filename not in audio_files:
                continue

            try:
                sr, signal = wavfile.read(audio_files[filename])
                if sr != FS:
                    ratio = FS / sr
                    new_length = int(len(signal) * ratio)
                    indices = np.linspace(0, len(signal) - 1, new_length).astype(int)
                    signal = signal[indices]

                if len(signal.shape) > 1:
                    signal = signal.mean(axis=1)

                signal = signal.astype(np.float32)
                if signal.max() > 1.0:
                    signal = signal / 32768.0

                room.add_source([src_x, src_y, src_z], signal=signal)
                source_count += 1

            except Exception as e:
                print(f"Error loading audio file {filename}: {e}")
                continue

        if source_count == 0:
            return False, "배치된 음원이 없거나 오디오 파일을 로드할 수 없습니다.", []

        # 6. 마이크 추가
        room.add_microphone(R)

        # 7. 시뮬레이션 실행 (return_premix=True로 각 음원별 신호도 얻음)
        room.image_source_model()
        premix = room.simulate(return_premix=True)
        # premix shape: (n_sources, n_mics, n_samples)
        # room.mic_array.signals shape: (n_mics, n_samples) - 모든 음원이 합쳐진 신호

        output_files = []
        session_id = str(uuid.uuid4())[:8]

        # 8. 각 음원별 신호 저장 (premix 사용)
        for i in range(premix.shape[0]):
            # 해당 음원이 모든 마이크에서 녹음된 신호의 평균
            source_signal = np.mean(premix[i], axis=0)

            max_val = np.max(np.abs(source_signal))
            if max_val > 0:
                source_signal = source_signal / max_val * 0.9

            source_signal_int = (source_signal * 32767).astype(np.int16)
            output_filename = f"source_{i + 1}_{session_id}.wav"
            output_path = os.path.join(output_dir, output_filename)
            wavfile.write(output_path, FS, source_signal_int)
            output_files.append(output_filename)

        # 9. 전부 같이 듣기 (mixed) - 모든 음원이 합쳐진 신호
        if source_count > 1:
            # 모든 마이크의 혼합 신호 평균
            mixed_signal = np.mean(room.mic_array.signals, axis=0)

            max_val = np.max(np.abs(mixed_signal))
            if max_val > 0:
                mixed_signal = mixed_signal / max_val * 0.9

            mixed_signal_int = (mixed_signal * 32767).astype(np.int16)
            mixed_filename = f"mixed_{session_id}.wav"
            mixed_path = os.path.join(output_dir, mixed_filename)
            wavfile.write(mixed_path, FS, mixed_signal_int)
            output_files.append(mixed_filename)

        return True, f"시뮬레이션 완료! {len(output_files)}개의 출력 생성", output_files

    except Exception as e:
        return False, f"시뮬레이션 오류: {str(e)}", []
