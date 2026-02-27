import styles from './page.module.css'

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Messenger</h1>
        <p className={styles.description}>
          A simple chat application with Vercel Web Analytics
        </p>
        
        <div className={styles.messagesContainer}>
          <div className={styles.message}>
            <div className={styles.messageHeader}>
              <span className={styles.userName}>Alice</span>
              <span className={styles.timestamp}>2:30 PM</span>
            </div>
            <div className={styles.messageContent}>
              Hey! How are you doing?
            </div>
          </div>
          
          <div className={styles.message}>
            <div className={styles.messageHeader}>
              <span className={styles.userName}>Bob</span>
              <span className={styles.timestamp}>2:32 PM</span>
            </div>
            <div className={styles.messageContent}>
              I&apos;m doing great! Thanks for asking. How about you?
            </div>
          </div>
          
          <div className={styles.message}>
            <div className={styles.messageHeader}>
              <span className={styles.userName}>Alice</span>
              <span className={styles.timestamp}>2:35 PM</span>
            </div>
            <div className={styles.messageContent}>
              I&apos;m good too! Just working on this new messenger app.
            </div>
          </div>
        </div>
        
        <div className={styles.inputContainer}>
          <input 
            type="text" 
            placeholder="Type a message..." 
            className={styles.input}
          />
          <button className={styles.sendButton}>Send</button>
        </div>
        
        <div className={styles.footer}>
          <p>✨ Powered by Vercel Web Analytics</p>
        </div>
      </div>
    </main>
  )
}
