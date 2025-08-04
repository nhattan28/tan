// tuluan.js
let questions = [];
let userAnswers = [];
let correctAnswers = [];
let totalPoint = 10;
let timer = null;
let uploadedFile = null;
let elapsedSeconds = 0;
let timeLimitSeconds = 0;
let totalTimeSeconds = 0;
let quizStarted = false;
let violationCount = 0;
let isSubmitting = false;

// Hàm hiển thị modal tùy chỉnh thay cho alert()
function showModal(title, message, isConfirm = false, onConfirm = null) {
  const modal = document.getElementById('genericModal');
  if (!modal) {
    console.error('Modal element not found. Please add a modal with id="genericModal" to your HTML.');
    alert(title + "\n" + message);
    return;
  }
  
  const modalTitle = document.getElementById('modalTitle');
  const modalMessage = document.getElementById('modalMessage');
  const modalButtons = document.getElementById('modalButtons');
  
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalButtons.innerHTML = '';

  const okButton = document.createElement('button');
  okButton.textContent = 'OK';
  okButton.onclick = () => modal.classList.add('hidden');
  modalButtons.appendChild(okButton);

  if (isConfirm) {
    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Nộp bài';
    confirmButton.classList.add('confirm-button');
    confirmButton.onclick = () => {
      modal.classList.add('hidden');
      if (onConfirm) onConfirm();
    };
    modalButtons.appendChild(confirmButton);
  }
  
  modal.classList.remove('hidden');
}

function handleFileAndStartExam(file) {
  uploadedFile = file;
  const reader = new FileReader();
  reader.onload = function(event) {
    const arrayBuffer = event.target.result;
    mammoth.convertToHtml({ arrayBuffer }).then(function(result) {
      sessionStorage.setItem('lastExamContent', result.value);
      parseQuestions(result.value);
    }).catch(() => showModal("❌ Lỗi đọc file.", "Không thể đọc file. Vui lòng kiểm tra lại định dạng file Word (.docx)."));
  };
  reader.readAsArrayBuffer(file);
}

async function startExam() {
  const fileInput = document.getElementById('wordFile');
  const file = fileInput.files[0];
  if (!file) {
    showModal('Vui lòng chọn file', 'Bạn cần chọn một file Word để bắt đầu bài kiểm tra.');
    return;
  }

  // Reset all states
  questions = [];
  userAnswers = [];
  correctAnswers = [];
  elapsedSeconds = 0;
  violationCount = 0;
  isSubmitting = false;
  if (timer) clearInterval(timer);
  
  const timeMode = document.querySelector('input[name="timeMode"]:checked').value;
  if (timeMode === 'limited') {
    const timeInput = document.getElementById('examTime').value;
    timeLimitSeconds = parseInt(timeInput) * 60;
    totalTimeSeconds = timeLimitSeconds;
    if (isNaN(timeLimitSeconds) || timeLimitSeconds <= 0) {
      showModal('Thời gian không hợp lệ', 'Vui lòng nhập thời gian làm bài hợp lệ.');
      return;
    }
  } else {
    timeLimitSeconds = 0;
  }

  fileInput.classList.add('hidden');
  document.getElementById('config').classList.add('hidden');

  quizStarted = true;
  setupTimer();
  setupAntiCheatListeners();
  handleFileAndStartExam(file);
}

function setupTimer() {
  const container = document.getElementById('examContainer');
  const countdown = document.getElementById('countdown');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressBarContainer = document.getElementById('progressBarContainer');

  container.classList.remove('hidden');
  if (timeLimitSeconds > 0) {
    progressBarContainer.style.display = 'block';
  } else {
    progressBarContainer.style.display = 'none';
  }

  if (timer) clearInterval(timer);
  let timeToDisplay = timeLimitSeconds > 0 ? timeLimitSeconds : 0;
  
  const updateTimerDisplay = () => {
    const m = Math.floor(timeToDisplay / 60);
    const s = timeToDisplay % 60;
    
    countdown.innerText = timeLimitSeconds > 0
      ? `⏳ Thời gian còn lại: ${m}:${s.toString().padStart(2, '0')}`
      : `⏱️ Đang làm bài: ${m}:${s.toString().padStart(2, '0')}`;

    if (timeLimitSeconds > 0) {
      const percentage = (timeToDisplay / totalTimeSeconds) * 100;
      progressBarFill.style.width = `${percentage}%`;

      if (percentage <= 20) {
        progressBarFill.classList.add('red');
        progressBarFill.classList.remove('yellow');
      } else if (percentage <= 50) {
        progressBarFill.classList.add('yellow');
        progressBarFill.classList.remove('red');
      } else {
        progressBarFill.classList.remove('yellow', 'red');
      }

      if (timeToDisplay <= 300) {
        countdown.classList.add('critical');
        countdown.classList.remove('warning');
      } else if (timeToDisplay <= 600) {
        countdown.classList.add('warning');
        countdown.classList.remove('critical');
      } else {
        countdown.classList.remove('warning', 'critical');
      }
    } else {
      countdown.classList.remove('warning', 'critical');
    }
  };

  updateTimerDisplay();

  timer = setInterval(() => {
    elapsedSeconds++;
    if (timeLimitSeconds > 0) {
      timeToDisplay = --timeLimitSeconds;
      if (timeToDisplay <= 0) {
        clearInterval(timer);
        isSubmitting = true;
        submitAnswers();
        return;
      }
    } else {
      timeToDisplay = elapsedSeconds;
    }
    updateTimerDisplay();
  }, 1000);
}

function setupAntiCheatListeners() {
  document.addEventListener('contextmenu', e => { 
    e.preventDefault(); 
    if (quizStarted) recordViolation("Nhấn chuột phải"); 
  });

  document.addEventListener('keydown', e => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
      (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.key === 'S' || e.key === 's' || e.key === 'V' || e.key === 'v' || e.key === 'P' || e.key === 'p'))
    ) {
      e.preventDefault();
      if (quizStarted) recordViolation("Nhấn phím tắt");
    }
  });

  window.addEventListener('blur', e => {
    if (quizStarted && !isSubmitting) {
      recordViolation("Rời khỏi trang");
    }
  });
  
  window.addEventListener('mouseleave', e => {
    if (quizStarted && !isSubmitting) {
      recordViolation("Di chuyển chuột ra khỏi website");
    }
  });

  window.addEventListener('beforeunload', e => {
    if (quizStarted && !isSubmitting) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

function recordViolation(message) {
  violationCount++;
  if (violationCount >= 2) {
    showModal(
      'Cảnh báo vi phạm!',
      `Bạn đã vi phạm quy chế thi lần ${violationCount}. Bài làm sẽ tự động được nộp!`,
      false,
      () => {
        isSubmitting = true;
        submitAnswers();
      }
    );
  } else {
    showModal(
      'Cảnh báo',
      `Lần vi phạm thứ ${violationCount}: ${message}. Nếu vi phạm lần nữa, bài làm sẽ bị nộp.`
    );
  }
}

function closeWarning(type) {
  if (type === 'unanswered') {
    document.getElementById('unansweredWarningModal').classList.add('hidden');
  } else {
    document.getElementById('genericModal').classList.add('hidden');
  }
}

function parseQuestions(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  const paragraphs = container.querySelectorAll("p");
  questions = [];
  correctAnswers = [];

  let currentQuestion = null;

  paragraphs.forEach(p => {
    const text = p.textContent.trim();
    const match = text.match(/^(\d+)[\.)]\s*(.+)/);
    if (match) {
      currentQuestion = match[2];
      questions.push(currentQuestion);
      correctAnswers.push('');
    } else if (currentQuestion && correctAnswers.length > 0) {
      const hasBoldTag = p.querySelector("strong, b");
      const inlineStyle = p.getAttribute("style") || "";
      const isInlineBold = /font-weight:\s*(bold|[6-9]00)/i.test(inlineStyle);
      if (hasBoldTag || isInlineBold) {
        correctAnswers[correctAnswers.length - 1] = p.textContent.trim();
      }
    }
  });

  const pointInput = parseFloat(document.getElementById('pointPerQuestion').value);
  if (!isNaN(pointInput) && pointInput > 0) {
    totalPoint = pointInput;
  } else {
    showModal('Lỗi', 'Điểm toàn bài phải là một số dương. Đã đặt lại thành 10.');
    totalPoint = 10;
    document.getElementById('pointPerQuestion').value = 10;
  }
  showExam();
}

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/[“”‘’]/g, '"')
    .trim();
}

function showExam() {
  const questionsContainer = document.getElementById('questionsContainer');
  questionsContainer.innerHTML = '';
  
  questions.forEach((q, i) => {
    questionsContainer.innerHTML += `
      <div>
        <p><strong>Câu ${i + 1}:</strong> ${q}</p>
        <textarea data-index="${i}" rows="3" style="width:100%"></textarea>
      </div>
    `;
  });
  
  const textareas = questionsContainer.querySelectorAll('textarea');
  textareas.forEach(textarea => {
    textarea.addEventListener('copy', e => {
      e.preventDefault();
      if (quizStarted) {
        recordViolation("Sao chép");
      }
    });
    textarea.addEventListener('paste', e => {
      e.preventDefault();
      if (quizStarted) {
        recordViolation("Dán");
      }
    });
    textarea.addEventListener('cut', e => {
      e.preventDefault();
      if (quizStarted) {
        recordViolation("Cắt");
      }
    });
  });

  questionsContainer.innerHTML += '<button onclick="submitAnswers()">Nộp bài</button>';
}

function submitAnswers() {
  if (timer) clearInterval(timer);
  const textareas = document.querySelectorAll('textarea');
  userAnswers = [];
  const unansweredQuestions = [];

  textareas.forEach((ta, i) => {
    const userAns = ta.value.trim();
    userAnswers.push(userAns);
    if (userAns === '') {
      unansweredQuestions.push(i + 1);
    }
  });

  if (unansweredQuestions.length > 0 && !isSubmitting) {
    showUnansweredWarning(unansweredQuestions);
  } else {
    isSubmitting = true;
    confirmSubmit();
  }
}

function showUnansweredWarning(unansweredQuestions) {
  const modal = document.getElementById('unansweredWarningModal');
  const list = document.getElementById('unansweredList');
  list.innerHTML = '';
  unansweredQuestions.forEach(q => {
    const li = document.createElement('li');
    li.textContent = `Câu ${q}`;
    list.appendChild(li);
  });
  modal.classList.remove('hidden');
}

function confirmSubmit() {
  let correct = 0;
  let answeredCount = 0;

  userAnswers.forEach((userAns, i) => {
    if (userAns !== '') {
      answeredCount++;
    }
    if (normalize(userAns) === normalize(correctAnswers[i])) {
      correct++;
    }
  });

  const total = questions.length;
  const wrong = answeredCount - correct;
  const perQuestionPoint = total > 0 ? totalPoint / total : 0;
  const score = Math.round(correct * perQuestionPoint * 100) / 100;
  const message = correct === total ? '🎉 Xuất sắc! Bạn làm đúng hết!' : (correct >= total / 2 ? '👍 Cố gắng thêm chút nữa!' : '💡 Bạn cần luyện tập thêm!');

  document.getElementById('unansweredWarningModal').classList.add('hidden');
  document.getElementById('examContainer').classList.add('hidden');
  document.getElementById('resultContainer').classList.remove('hidden');

  document.getElementById('totalQuestions').textContent = total;
  document.getElementById('answeredQuestions').textContent = answeredCount;
  document.getElementById('correctQuestions').textContent = correct;
  document.getElementById('wrongQuestions').textContent = wrong;
  document.getElementById('finalScore').textContent = `${score}/${totalPoint}`;
  document.getElementById('finalTime').textContent = `${Math.floor(elapsedSeconds / 60)} phút ${elapsedSeconds % 60} giây`;
  document.getElementById('violationCount').textContent = violationCount;

  document.getElementById('summaryMessage').textContent = message;
  document.getElementById('answerReview').innerHTML = '';
  document.getElementById('answerReview').style.display = 'none';
  document.getElementById('buttons').style.display = 'flex';
  
  quizStarted = false;
}

function reviewAnswers(filter = null) {
  const reviewDiv = document.getElementById('answerReview');
  reviewDiv.innerHTML = '';
  reviewDiv.style.display = 'block';

  questions.forEach((q, i) => {
    const isCorrect = normalize(userAnswers[i]) === normalize(correctAnswers[i]);
    if (filter === null || (filter === true && isCorrect) || (filter === false && !isCorrect)) {
      reviewDiv.innerHTML += `
        <div class="${isCorrect ? 'correct' : 'incorrect'}">
          <p><strong>Câu ${i + 1}:</strong> ${q}</p>
          <p>Đáp án của bạn: ${userAnswers[i]}</p>
          <p>Đáp án đúng: ${correctAnswers[i]}</p>
        </div>
      `;
    }
  });
}

function filterAnswers(showCorrect) {
  reviewAnswers(showCorrect);
}

function retryLastExam() {
  const savedContent = sessionStorage.getItem('lastExamContent');
  if (savedContent) {
    questions = [];
    userAnswers = [];
    correctAnswers = [];
    elapsedSeconds = 0;
    violationCount = 0;
    isSubmitting = false;
    if (timer) clearInterval(timer);

    document.getElementById('resultContainer').classList.add('hidden');
    document.getElementById('config').classList.add('hidden');
    document.getElementById('wordFile').classList.add('hidden');
    
    quizStarted = true;
    
    // Thêm dòng này để reset thời gian giới hạn
    if (timeLimitSeconds > 0) {
      timeLimitSeconds = totalTimeSeconds;
    }
    
    setupTimer();
    setupAntiCheatListeners();
    parseQuestions(savedContent);

    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(ta => ta.value = '');
    
  } else {
    goHome();
  }
}

function goHome() {
  sessionStorage.removeItem('lastExamContent');
  location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
    const unlimitedRadio = document.getElementById('unlimitedTime');
    const limitedRadio = document.getElementById('limitedTime');
    const examTimeInput = document.getElementById('examTime');

    unlimitedRadio.addEventListener('change', () => {
        if (unlimitedRadio.checked) {
            examTimeInput.disabled = true;
            examTimeInput.value = '';
        }
    });

    limitedRadio.addEventListener('change', () => {
        if (limitedRadio.checked) {
            examTimeInput.disabled = false;
            examTimeInput.focus();
        }
    });
});

function goToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

const mammothScript = document.createElement('script');
mammothScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.2/mammoth.browser.min.js';
document.head.appendChild(mammothScript);

