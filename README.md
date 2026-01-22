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

- Python 3.8+
- Node.js 20.19+ 또는 22.12+

## 설치

### 1. 백엔드 설치

```bash
cd backend
pip install -r requirements.txt
```

### 2. 프론트엔드 설치

```bash
cd frontend
npm install
```

## 실행

### 1. 백엔드 서버 실행

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. 프론트엔드 개발 서버 실행

```bash
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
room-simulation/
├── backend/
│   ├── main.py           # FastAPI 서버
│   ├── simulation.py     # pyroomacoustics 시뮬레이션
│   ├── models.py         # Pydantic 모델
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # 메인 React 컴포넌트
│   │   └── App.css       # 스타일
│   └── package.json
└── README.md
```
