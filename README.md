# Room Acoustic Simulation

pyroomacoustics를 활용한 방 음향 시뮬레이션 웹 애플리케이션

## 기능

- 다각형 방 그리기
- 로봇 배치 및 크기 조절
- 마이크 배치 (로봇 위)
- 음원(WAV 파일) 업로드 및 배치
- pyroomacoustics 기반 음향 시뮬레이션
- 시뮬레이션 결과 오디오 재생 및 다운로드

## 시스템 요구사항

- Anaconda 또는 Miniconda
- Node.js 20.19+ 또는 22.12+

## 환경 세팅

### 1. Conda 가상환경 생성 및 활성화

```bash
# 가상환경 생성 (Python 3.10)
conda create -n room-env python=3.10 -y

# 가상환경 활성화
conda activate room-env
```

### 2. 백엔드 라이브러리 설치

```bash

pip install -r requirements.txt
```

### 3. 프론트엔드 라이브러리 설치

```bash
# 1. Node.js 설치 (Conda 이용, LTS 버전 설치 권장)
conda install -c conda-forge nodejs=22 -y

# 설치 확인 (버전이 뜨면 성공)
node -v
npm -v
```

React 라이브러리 설치 

```bash
# 현재 위치가 ~/room-envulation/frontend 인지 확인하세요.
cd frontend
# axios: 백엔드(FastAPI)와 통신하기 위한 도구
# konva, react-konva: HTML5 Canvas를 리액트에서 쉽게 다루게 해주는 도구 (핵심!)
npm install axios konva react-konva

```

```bash

npm install
```

## 실행

### 1. 백엔드 서버 실행

```bash
# conda 환경 활성화 (이미 활성화되어 있으면 생략)
conda activate room-env

# 백엔드 디렉토리로 이동
cd backend

# 서버 실행
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. 프론트엔드 개발 서버 실행

```bash
# 새 터미널에서 실행
cd frontend
npm run dev
```

### 3. 브라우저에서 접속

```
http://localhost:5173
```

## 사용 방법

1. **방 만들기**: 버튼 클릭 후 캔버스에 점을 찍어 방 모양을 그린 뒤 "완료" 클릭
2. **로봇 불러오기**: 버튼 클릭 후 방 안에 클릭하여 로봇 배치
3. **마이크 불러오기**: 버튼 클릭 후 로봇 원 안에 클릭하여 마이크 배치
4. **음원 불러오기**: 버튼 클릭 후 WAV 파일 드래그 앤 드롭
5. **음원 배치**: 음원 리스트에서 클릭 후 방 안에 클릭하여 배치
6. **시뮬레이션 실행**: 버튼 클릭하여 시뮬레이션 실행
7. **결과 확인**: 하단 오디오 플레이어에서 재생/다운로드

## 시뮬레이션 파라미터

- 샘플링 레이트: 16000 Hz
- 반사 차수: 3
- 벽 흡음 계수: 0.2
- 방 높이: 2.5m
- 마이크/음원 높이: 1.0m
- 스케일: 100px = 1m

## 프로젝트 구조

```
room-envulation/
├── backend/
│   ├── main.py           # FastAPI 서버
│   ├── simulation.py     # pyroomacoustics 시뮬레이션
│   ├── models.py         # Pydantic 모델
│   └── requirements.txt  # Python 의존성
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # 메인 React 컴포넌트
│   │   └── App.css       # 스타일
│   └── package.json      # Node.js 의존성
└── README.md
```

## 문제 해결

### pyroomacoustics 설치 오류 시

```bash
# conda-forge에서 설치
conda install -c conda-forge pyroomacoustics
```

### 포트 충돌 시

```bash
# 백엔드 포트 변경
uvicorn main:app --reload --host 0.0.0.0 --port 8001

# 프론트엔드에서 API_URL 변경 필요 (App.jsx)
```
